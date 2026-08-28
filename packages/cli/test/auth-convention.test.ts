/**
 * The auth-decorator fix, and why it needs the project's own vocabulary.
 *
 * The original template inserted `@require_auth` unconditionally. Three things
 * were wrong with that, in increasing order of seriousness:
 *
 *  1. The project might not have `require_auth`, so the patched file fails at
 *     import.
 *  2. The rule's own pattern matches `requires_auth`, not `require_auth`, so
 *     the fix could not clear the finding it claimed to fix — the verifier
 *     caught this, correctly, and reported `fail`.
 *  3. It placed the decorator *above* the routing decorator. Decorators apply
 *     bottom-up, so the router would register the undecorated function and the
 *     authentication would never run. A security fix that silently disables
 *     the protection it advertises is worse than no fix.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findAuthConvention } from '../src/engine/conventions.js';
import { buildLocalFix } from '../src/engine/fix.js';

const ADMIN = `from flask import Blueprint
from flask_login import login_required

bp = Blueprint("admin", __name__)


@bp.route("/admin/reports")
@login_required
def reports():
    return "ok"
`;

const PAYMENTS = `from flask import Blueprint

bp = Blueprint("pay", __name__)


@bp.route("/payments/refund", methods=["POST"])
def refund():
    return "", 204
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-auth-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'payments.py'), PAYMENTS, 'utf8');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('finding the convention', () => {
  it('discovers the decorator the project already uses', () => {
    writeFileSync(join(dir, 'src', 'admin.py'), ADMIN, 'utf8');

    const found = findAuthConvention(dir);
    expect(found?.name).toBe('login_required');
    expect(found?.importLine).toBe('from flask_login import login_required');
  });

  it('finds nothing when the project has no authenticated route', () => {
    expect(findAuthConvention(dir)).toBeUndefined();
  });
});

describe('the fix', () => {
  const fixRefund = async (context?: { auth?: { name: string; importLine?: string } }) =>
    buildLocalFix({
      filePath: join(dir, 'src', 'payments.py'),
      source: PAYMENTS,
      line: 6, // the @bp.route line
      ruleId: 'SIR-SEC-020',
      action: 'add_auth_decorator',
      ...(context ? { context } : {}),
    });

  it('declines when there is no convention to copy', async () => {
    // Adding authentication where a project has none is a design decision.
    expect(await fixRefund()).toBeUndefined();
    expect(await fixRefund({})).toBeUndefined();
  });

  it('puts the decorator below the route and above the definition', async () => {
    const fix = await fixRefund({
      auth: { name: 'login_required', importLine: 'from flask_login import login_required' },
    });

    const lines = fix!.patched.split('\n');
    const route = lines.findIndex((l) => l.includes('@bp.route'));
    const auth = lines.findIndex((l) => l.trim() === '@login_required');
    const def = lines.findIndex((l) => l.startsWith('def refund'));

    // Order matters more than it looks: route, then auth, then the function.
    expect(route).toBeLessThan(auth);
    expect(auth).toBeLessThan(def);
    expect(auth + 1).toBe(def);
  });

  it('brings the import with it', async () => {
    const fix = await fixRefund({
      auth: { name: 'login_required', importLine: 'from flask_login import login_required' },
    });

    // Without this the patched file raises NameError the moment it is imported.
    expect(fix!.patched).toContain('from flask_login import login_required');
  });

  it('actually clears the finding', async () => {
    const fix = await fixRefund({
      auth: { name: 'login_required', importLine: 'from flask_login import login_required' },
    });

    expect(fix!.verifierStatus).toBe('pass');
  });

  it('refuses a decorator the rule would not recognise', async () => {
    const fix = await fixRefund({ auth: { name: 'require_auth' } });

    // `require_auth` does not match the rule's `requires_auth`, so the finding
    // survives the patch. The verifier must say so rather than pass it.
    expect(fix!.verifierStatus).toBe('fail');
    expect(fix!.escalate).toBe(true);
  });
});
