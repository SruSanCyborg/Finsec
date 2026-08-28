/**
 * The rule catalogue, as executable detectors.
 *
 * Each rule gets the parsed file and yields findings. The AST-based ones are the
 * point: a regex for "SQL injection" flags every `execute(` in the codebase,
 * whereas asking the tree whether the argument is a *binary expression* or an
 * *f-string* separates `cur.execute(q, params)` from `cur.execute(q % uid)`.
 * That difference is the whole claim to a low false-positive rate.
 *
 * Secrets are the exception and are deliberately regex plus entropy, because a
 * credential is a lexical fact, not a syntactic one.
 */

import { enclosing, walk } from './parse.js';
import type { ManifestFile } from './manifests.js';
import { estimateExposure } from './exposure-model.js';
import type { Reachability } from './exposure-model.js';
import type { ParsedFile, SyntaxNode } from './parse.js';
import type { Category, Severity } from '../domain.js';

export interface RawFinding {
  rule_id: string;
  severity: Severity;
  category: Category;
  message: string;
  line: number;
  col: number;
  endLine?: number;
  snippet: string;
  compliance_ref: string[];
  fix_action?: string;
  /** Secrets only; the threat stage may upgrade this to verified_live. */
  validity?: 'unknown';
  money_at_risk_inr?: number;
  /** Evidence the attack-path builder chains on. */
  tags?: string[];
}

export interface Rule {
  id: string;
  severity: Severity;
  category: Category;
  message: string;
  compliance_ref: string[];
  fix_action?: string;
  languages?: string[];
  /** Rules that read source. Absent on a manifest-only rule. */
  run?(file: ParsedFile): RawFinding[];
  /** Rules that read dependency manifests. Absent on every source rule. */
  runManifest?(file: ManifestFile): RawFinding[];
}

// ---------------------------------------------------------------- helpers

const line = (node: SyntaxNode) => node.startPosition.row + 1;
const col = (node: SyntaxNode) => node.startPosition.column + 1;

/** The source line, trimmed, with any long literal elided. */
function snippetFor(file: ParsedFile, node: SyntaxNode): string {
  const raw = (file.lines[node.startPosition.row] ?? '').trim();
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}

function base(
  rule: Omit<Rule, 'run'>,
  file: ParsedFile,
  node: SyntaxNode,
  overrides: Partial<RawFinding> = {},
  provider?: string,
): RawFinding {
  // Money comes from the documented model in exposure-model.ts, never from a
  // number written inline. A figure nobody can interrogate is worse than none.
  const modelled = estimateExposure({
    ruleId: rule.id,
    severity: rule.severity,
    ...(provider ? { provider } : {}),
  });

  return {
    rule_id: rule.id,
    severity: rule.severity,
    category: rule.category,
    message: rule.message,
    line: line(node),
    col: col(node),
    endLine: node.endPosition.row + 1,
    snippet: snippetFor(file, node),
    compliance_ref: rule.compliance_ref,
    money_at_risk_inr: modelled.amount,
    ...(rule.fix_action ? { fix_action: rule.fix_action } : {}),
    ...overrides,
  };
}

/** Dotted call name: `hashlib.md5(...)` → `hashlib.md5`. */
function calleeName(call: SyntaxNode): string {
  const fn = call.childForFieldName('function');
  return fn ? fn.text : '';
}

function argumentsOf(call: SyntaxNode): SyntaxNode[] {
  const args = call.childForFieldName('arguments');
  if (!args) return [];
  const out: SyntaxNode[] = [];
  for (let i = 0; i < args.namedChildCount; i += 1) {
    const child = args.namedChild(i);
    if (child) out.push(child);
  }
  return out;
}

/**
 * Whether a string node splices an expression into itself: a Python f-string,
 * or a JavaScript template literal.
 */
function hasInterpolation(node: SyntaxNode): boolean {
  if (node.type !== 'string' && node.type !== 'template_string' && node.type !== 'string_literal') {
    return false;
  }
  for (let i = 0; i < node.childCount; i += 1) {
    const type = node.child(i)?.type;
    if (type === 'interpolation' || type === 'template_substitution') return true;
  }
  return false;
}

/** Shannon entropy in bits per character — the standard secret heuristic. */
export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// ---------------------------------------------------------------- secrets

/**
 * Provider key shapes. Prefixes are far stronger evidence than entropy alone,
 * which is why these are matched first.
 *
 * `testMode` is the important column. A test-mode credential is a real finding
 * — it is still a key in source, PCI-DSS 8.6.2 does not carve out an exception
 * for the ones that are inconvenient to rotate — but it cannot move money, and
 * the exposure model already prices it at a hundredth of a live key. Rating it
 * `critical` anyway made severity and money disagree by two orders of magnitude
 * on the same finding, and made a test fixture fail a build exactly as hard as
 * a key that can move ₹42 lakh. That is how a linter gets switched off.
 */
const PROVIDER_PATTERNS: Array<{ name: string; pattern: RegExp; testMode?: true }> = [
  { name: 'Stripe secret key', pattern: /\b(sk|rk)_live_[0-9a-zA-Z]{16,}/ },
  { name: 'Stripe test key', pattern: /\b(sk|rk)_test_[0-9a-zA-Z]{16,}/, testMode: true },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Razorpay live key', pattern: /\brzp_live_[0-9a-zA-Z]{10,}/ },
  { name: 'Razorpay test key', pattern: /\brzp_test_[0-9a-zA-Z]{10,}/, testMode: true },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'private key block', pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
];

/** Identifiers that make a high-entropy string look like a credential. */
const SECRET_NAME = /(secret|token|password|passwd|api_?key|access_?key|private_?key|credential|auth)/i;

const hardcodedSecret: Rule = {
  id: 'SIR-SEC-001',
  severity: 'critical',
  category: 'secrets',
  message: 'Hardcoded payment-provider secret key',
  compliance_ref: ['PCI-DSS:8.6.2', 'RBI-DPSC', 'DPDP:8', 'CWE:798'],
  fix_action: 'env_lookup',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'string' && node.type !== 'string_literal' && node.type !== 'interpreted_string_literal') {
        continue;
      }
      for (const provider of PROVIDER_PATTERNS) {
        if (!provider.pattern.test(node.text)) continue;
        findings.push(
          base(
            this,
            file,
            node,
            {
              message: provider.testMode
                ? `Hardcoded ${provider.name} — test mode, so no money moves, but it is still a credential in source`
                : `Hardcoded ${provider.name}`,
              // Severity tracks the blast radius, not the pattern's confidence.
              // The match is just as certain either way; what differs is what
              // someone holding the key can do with it.
              ...(provider.testMode ? { severity: 'medium' as const } : {}),
              validity: 'unknown',
              tags: ['secret', 'credential', ...(provider.testMode ? ['test-mode'] : [])],
            },
            provider.name,
          ),
        );
        break;
      }
    }
    return findings;
  },
};

const highEntropySecret: Rule = {
  id: 'SIR-SEC-002',
  severity: 'high',
  category: 'secrets',
  message: 'High-entropy string in source or config',
  compliance_ref: ['PCI-DSS:8.6.2', 'DPDP:8'],
  fix_action: 'env_lookup',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'assignment' && node.type !== 'variable_declarator' && node.type !== 'pair') continue;

      const text = node.text;
      // Only strings assigned to a credential-shaped name. Entropy alone flags
      // every hash, UUID and base64 blob in a codebase, which is how a secret
      // scanner earns a reputation for noise.
      if (!SECRET_NAME.test(text.split('=')[0] ?? text)) continue;

      for (const child of walk(node)) {
        if (child.type !== 'string' && child.type !== 'string_literal') continue;
        const value = child.text.replace(/^['"`]|['"`]$/g, '');
        if (value.length < 16 || value.length > 200) continue;
        // A provider key is SIR-SEC-001's finding, not this one.
        if (PROVIDER_PATTERNS.some((p) => p.pattern.test(value))) continue;
        if (shannonEntropy(value) < 3.5) continue;

        findings.push(
          base(this, file, child, {
            validity: 'unknown',
            tags: ['secret'],
          }),
        );
        break;
      }
    }
    return findings;
  },
};

// ---------------------------------------------------------------- injection

const sqlInjection: Rule = {
  id: 'SIR-SEC-010',
  severity: 'critical',
  category: 'injection',
  message: 'SQL built with string formatting',
  compliance_ref: ['PCI-DSS:6.2.4', 'RBI-DPSC', 'CWE:89'],
  fix_action: 'parameterize_query',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'call') continue;
      const callee = calleeName(node);
      if (!/\b(execute|executemany|raw|query)$/.test(callee)) continue;

      const [first] = argumentsOf(node);
      if (!first) continue;

      // The distinction that matters: a bound query passes a string and its
      // parameters separately. Interpolation happens *inside* the argument.
      const interpolated =
        first.type === 'binary_operator' || // "..." % uid  or  "..." + uid
        first.type === 'binary_expression' ||
        // An f-string is not its own node type — tree-sitter reports a `string`
        // whose children include an `interpolation`. Checking the type alone
        // missed `f"... {uid}"`, which is the most common form of this bug in
        // real code.
        hasInterpolation(first) ||
        (first.type === 'call' && /\.format$/.test(calleeName(first)));

      if (!interpolated) continue;

      findings.push(base(this, file, node, { tags: ['injection', 'database'] }));
    }
    return findings;
  },
};

const commandInjection: Rule = {
  id: 'SIR-SEC-011',
  severity: 'critical',
  category: 'injection',
  message: 'OS command built from user input',
  compliance_ref: ['PCI-DSS:6.2.4', 'CWE:78'],
  fix_action: 'sanitize_input',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'call') continue;
      const callee = calleeName(node);
      const isSubprocess = /subprocess\.(run|call|Popen|check_output)$/.test(callee);
      const isOsSystem = /^os\.system$/.test(callee) || /child_process\.exec$/.test(callee);

      if (isOsSystem) {
        findings.push(base(this, file, node, { tags: ['injection', 'shell'] }));
        continue;
      }
      if (!isSubprocess) continue;
      if (!/shell\s*=\s*True/.test(node.text)) continue;

      findings.push(base(this, file, node, { tags: ['injection', 'shell'] }));
    }
    return findings;
  },
};

// ---------------------------------------------------------------- auth

const WEB_DECORATORS = /(route|get|post|put|delete|patch|api|app)/i;
/**
 * Decorators that make a route authenticated.
 *
 * Exported because the fix engine has to agree with it exactly: a fix that
 * inserts a decorator this pattern does not recognise cannot clear the finding,
 * however sensible the decorator looks. That mismatch is precisely what the
 * `add_auth_decorator` template got wrong — it inserted `require_auth` against
 * a pattern that only matches `requires_auth`.
 */
export const AUTH_DECORATORS = /(login_required|requires_auth|authenticated|jwt_required|permission|authorize|protected)/i;

const missingAuth: Rule = {
  id: 'SIR-SEC-020',
  severity: 'high',
  category: 'auth',
  message: 'Route missing an authentication decorator',
  compliance_ref: ['PCI-DSS:8.4.2', 'RBI-DPSC'],
  fix_action: 'add_auth_decorator',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'decorated_definition') continue;

      const decorators: string[] = [];
      for (let i = 0; i < node.namedChildCount; i += 1) {
        const child = node.namedChild(i);
        if (child?.type === 'decorator') decorators.push(child.text);
      }
      if (decorators.length === 0) continue;

      const isRoute = decorators.some((d) => WEB_DECORATORS.test(d));
      const hasAuth = decorators.some((d) => AUTH_DECORATORS.test(d));
      if (!isRoute || hasAuth) continue;

      findings.push(base(this, file, node, { tags: ['auth', 'endpoint'] }));
    }
    return findings;
  },
};

const jwtUnverified: Rule = {
  id: 'SIR-SEC-021',
  severity: 'critical',
  category: 'auth',
  message: 'JWT decoded without signature verification',
  compliance_ref: ['PCI-DSS:8.4.2', 'PCI-DSS:8.3.1', 'RBI-DPSC'],
  fix_action: 'enforce_jwt_verify',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'call') continue;
      if (!/jwt\.decode$|jsonwebtoken\.decode$/.test(calleeName(node))) continue;

      const text = node.text;
      // The quote matters. PyJWT's documented way to skip verification is
      // `options={"verify_signature": False}` — a dict key, so the name is
      // followed by `"` before the colon. Matching only the bare `verify=False`
      // form meant the rule missed the spelling almost every real codebase uses.
      const unverified =
        /["']?verify(_signature)?["']?\s*[:=]\s*(False|false)/.test(text) ||
        /alg(orithms)?\s*[:=]\s*\[?\s*['"]none['"]/i.test(text);

      if (!unverified) continue;
      findings.push(
        base(this, file, node, { money_at_risk_inr: 350_000, tags: ['auth', 'bypass'] }),
      );
    }
    return findings;
  },
};

// ---------------------------------------------------------------- pii

/** Unambiguous PII identifiers. */
const PII_FIELD = /(\bpan\b|aadhaar|\bcvv\b|\bcvc\b|\bssn\b|passport|card[_.]?(number|no)\b|account[_.]?number)/i;

/**
 * The same data reached indirectly: `card.get("number")`, `card["number"]`,
 * `body.card.number`. Matching only `card.number` missed the dictionary access
 * that the demo repo actually uses, which is also the form most real webhook
 * handlers use.
 */
const PII_ACCESS = /\bcard\b[^)]{0,24}?['"]?(number|no|cvv|cvc)['"]?/i;

/**
 * Calls that render a value safe to log. Kept broad on purpose: the cost of
 * missing one is a false positive on code that is already doing the right
 * thing, which is the failure mode that gets a linter switched off.
 */
const REDACTED = /^\s*(redact|mask|tokeni[sz]e|hash|anonymi[sz]e|scrub|saniti[sz]e|last4|truncate)\s*\(/i;

/**
 * Truncation, the other form PCI-DSS 3.3.1 permits: at most the first six and
 * the last four digits may be displayed. `card["number"][-4:]` is the idiom, and
 * flagging it told a team doing exactly the right thing that it was leaking a
 * PAN — the false positive that gets a linter switched off.
 *
 * Deliberately narrow. A slice that keeps more than six characters is not
 * truncation, and `[0:16]` is still a finding.
 */
function isTruncated(text: string): boolean {
  // Python: [-4:] or [:6]
  if (/\[\s*-[1-6]\s*:\s*\]/.test(text)) return true;
  if (/\[\s*:\s*[1-6]\s*\]/.test(text)) return true;
  // JavaScript: .slice(-4), .substr(-4), .slice(0, 6)
  if (/\.(slice|substr|substring)\s*\(\s*-[1-6]\s*\)/.test(text)) return true;
  if (/\.(slice|substr|substring)\s*\(\s*0\s*,\s*[1-6]\s*\)/.test(text)) return true;
  return false;
}

const LOG_CALL = /(^|\.)(log|logger|logging|console)\.(debug|info|warn|warning|error|log)$/;

const piiInLogs: Rule = {
  id: 'SIR-SEC-030',
  severity: 'high',
  category: 'logging',
  message: 'PAN, Aadhaar, or other PII written to logs',
  compliance_ref: ['PCI-DSS:3.4.1', 'DPDP:8', 'GDPR:Art.5'],
  fix_action: 'redact_pii_log',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'call') continue;
      if (!LOG_CALL.test(calleeName(node))) continue;

      // An argument already passed through a redaction helper is not a leak.
      // Without this the rule can never be satisfied by its own remediation:
      // the fix verifier applied `redact(...)`, re-ran the rule, and correctly
      // reported that nothing had changed. SIR-SEC-031 has always had the
      // equivalent check; this one did not.
      const args = argumentsOf(node);
      const leaking = args.some(
        (arg) =>
          (PII_FIELD.test(arg.text) || PII_ACCESS.test(arg.text)) &&
          !REDACTED.test(arg.text) &&
          !isTruncated(arg.text),
      );
      if (!leaking) continue;

      findings.push(base(this, file, node, { tags: ['pii', 'exposure'] }));
    }
    return findings;
  },
};

const unmaskedPan: Rule = {
  id: 'SIR-SEC-031',
  severity: 'critical',
  category: 'pii',
  message: 'Full PAN stored unmasked',
  compliance_ref: ['PCI-DSS:3.5.1', 'PCI-DSS:3.4.1', 'RBI-DPSC'],
  fix_action: 'tokenize_pan',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'assignment' && node.type !== 'expression_statement') continue;

      const text = node.text;
      // A column definition whose name is a PAN and whose type is a plain
      // string: stored, not tokenised, not masked.
      if (!/Column\s*\(|models\.(Char|Text)Field/.test(text)) continue;
      if (!PII_FIELD.test(text.split('=')[0] ?? '')) continue;
      if (/token|vault|mask|hash|encrypt/i.test(text)) continue;

      findings.push(
        base(this, file, node, { money_at_risk_inr: 400_000, tags: ['pii', 'storage'] }),
      );
    }
    return findings;
  },
};

// ---------------------------------------------------------------- crypto

const weakCrypto: Rule = {
  id: 'SIR-SEC-040',
  severity: 'medium',
  category: 'crypto',
  message: 'Weak hash algorithm',
  compliance_ref: ['PCI-DSS:6.2.4', 'PCI-DSS:3.6.1', 'RBI-DPSC'],
  fix_action: 'upgrade_crypto',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'call') continue;
      const callee = calleeName(node);

      if (/hashlib\.(md5|sha1)$|createHash$/.test(callee)) {
        const weak = /md5|sha1/i.test(node.text);
        if (!weak) continue;
        const algorithm = /md5/i.test(node.text) ? 'MD5' : 'SHA1';
        findings.push(
          base(this, file, node, { message: `Weak hash algorithm (${algorithm})`, tags: ['crypto'] }),
        );
        continue;
      }

      // A fixed IV defeats the point of an IV; it is a literal, not a nonce.
      if (/\b(AES|Cipher)\.new$|createCipheriv$/.test(callee)) {
        if (/MODE_ECB/.test(node.text)) {
          findings.push(
            base(this, file, node, { message: 'ECB mode leaks plaintext structure', tags: ['crypto'] }),
          );
        }
      }
    }

    // Static IVs are assignments, not calls.
    for (const node of walk(file.root)) {
      if (node.type !== 'assignment') continue;
      const name = node.text.split('=')[0] ?? '';
      if (!/\biv\b|initialization_vector/i.test(name)) continue;
      if (!/['"][^'"]{8,}['"]|b['"]/.test(node.text)) continue;
      if (/urandom|random|token_bytes|randbytes/.test(node.text)) continue;

      findings.push(
        base(this, file, node, { message: 'Static initialization vector', tags: ['crypto'] }),
      );
    }

    return findings;
  },
};

const plaintextTransport: Rule = {
  id: 'SIR-SEC-041',
  severity: 'high',
  category: 'crypto',
  message: 'Cardholder data sent over plain HTTP',
  compliance_ref: ['PCI-DSS:4.2.1', 'RBI-DPSC'],
  fix_action: 'enforce_tls',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'string' && node.type !== 'string_literal') continue;
      const value = node.text;
      if (!/http:\/\//.test(value)) continue;
      // Localhost over HTTP is not a cardholder-data exposure.
      if (/http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(value)) continue;
      // Namespaces and schema URLs are identifiers, not endpoints.
      if (/w3\.org|xmlns|schemas?\.|\.dtd|\.xsd/.test(value)) continue;

      findings.push(
        base(this, file, node, { money_at_risk_inr: 90_000, tags: ['crypto', 'transport'] }),
      );
    }
    return findings;
  },
};

// ---------------------------------------------------------------- money endpoints

const MONEY_ROUTE = /(transfer|payout|refund|charge|payment|withdraw|settle|disburse)/i;

const missingRateLimit: Rule = {
  id: 'SIR-SEC-050',
  severity: 'medium',
  category: 'ratelimit',
  message: 'Money-movement endpoint without a rate limit',
  compliance_ref: ['PCI-DSS:6.2.4', 'RBI-DPSC'],
  fix_action: 'add_rate_limit',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'decorated_definition') continue;
      const text = node.text;
      if (!WEB_DECORATORS.test(text) || !MONEY_ROUTE.test(text)) continue;
      if (/limit|throttle|ratelimit/i.test(text)) continue;

      findings.push(base(this, file, node, { tags: ['ratelimit', 'money'] }));
    }
    return findings;
  },
};

const missingIdempotency: Rule = {
  id: 'SIR-SEC-051',
  severity: 'medium',
  category: 'ratelimit',
  message: 'Money-movement POST without an idempotency key',
  compliance_ref: [],
  fix_action: 'add_idempotency_key',
  run(file) {
    const findings: RawFinding[] = [];
    for (const node of walk(file.root)) {
      if (node.type !== 'decorated_definition') continue;
      const text = node.text;
      if (!/post|put/i.test(text) || !MONEY_ROUTE.test(text)) continue;
      if (/idempotenc/i.test(text)) continue;

      findings.push(base(this, file, node, { tags: ['money'] }));
    }
    return findings;
  },
};


// ---------------------------------------------------------------- supply chain

/**
 * A dependency line, as far as it can be judged without a network.
 *
 * The PRD calls this rule "dependency with install script/obfuscation" and the
 * demo replay shows two variants of it. Neither can be read the way it sounds:
 * knowing whether a *dependency* runs an install script means fetching that
 * package's own manifest from the registry, and a scan makes no network calls.
 * So the rule reports the supply-chain facts a manifest states about itself, and
 * names each one for what it observed rather than for what it implies.
 */
const NON_REGISTRY = /^(git\+|git:|https?:|ssh:|file:|link:|\.{0,2}\/)|\.(tar\.gz|tgz|zip|whl)(#|$)/i;
const FLOATING_NPM = /^(\*|latest|x|\^|~|>=?|<)/;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall'];

/**
 * The line a `"key": "value"` pair sits on, so a JSON finding still points at
 * source. Falls back to the key alone, then to the top of the file — a finding
 * that admits it only knows which file is better than one pointing at a line
 * that has nothing to do with it.
 */
function lineOf(lines: readonly string[], key: string, value: string): number {
  const exact = lines.findIndex((text) => text.includes(`"${key}"`) && text.includes(value));
  if (exact >= 0) return exact;
  const byKey = lines.findIndex((text) => text.includes(`"${key}"`));
  return byKey >= 0 ? byKey : 0;
}

const supplyChain: Rule = {
  id: 'SIR-SEC-060',
  severity: 'high',
  category: 'supplychain',
  message: 'Dependency declared outside the registry',
  compliance_ref: ['PCI-DSS:6.3.2'],
  fix_action: 'pin_or_remove_dep',
  runManifest(file) {
    const findings: RawFinding[] = [];

    /** One finding on a manifest line, priced by how reachable that fact is. */
    const at = (
      index: number,
      message: string,
      severity: Severity,
      reachability: Reachability,
    ): RawFinding => {
      const raw = file.lines[index] ?? '';
      const text = raw.trim();
      return {
        rule_id: this.id,
        severity,
        category: this.category,
        message,
        line: index + 1,
        col: raw.length - raw.trimStart().length + 1,
        snippet: text.length > 120 ? `${text.slice(0, 117)}…` : text,
        compliance_ref: this.compliance_ref,
        ...(this.fix_action ? { fix_action: this.fix_action } : {}),
        money_at_risk_inr: estimateExposure({ ruleId: this.id, severity, reachability }).amount,
        tags: ['supplychain'],
      };
    };

    // package.json is data, so it is read as data. Scanning it line by line
    // matched `"sirius": "./dist/cli.js"` under `bin` and called the package a
    // dependency resolved outside the registry — a key-value pair looks the
    // same everywhere in a JSON file, and only its position says what it means.
    if (file.kind === 'npm') {
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(file.lines.join('\n')) as Record<string, unknown>;
      } catch {
        return findings; // a manifest we cannot read is not one we can judge
      }

      const scripts = (pkg.scripts ?? {}) as Record<string, string>;
      for (const hook of INSTALL_HOOKS) {
        const body = scripts[hook];
        if (typeof body !== 'string') continue;
        // The project's own script, not a dependency's — but it is the same
        // execution slot, it runs on every `npm install`, and in CI that means
        // it runs with whatever credentials the build has.
        findings.push(
          at(lineOf(file.lines, hook, body), `"${hook}" runs on every dependency install`, 'high', 'direct'),
        );
      }

      for (const field of DEPENDENCY_FIELDS) {
        const deps = pkg[field];
        if (!deps || typeof deps !== 'object') continue;
        for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
          if (typeof spec !== 'string') continue;
          const index = lineOf(file.lines, name, spec);
          if (NON_REGISTRY.test(spec)) {
            findings.push(at(index, `Dependency "${name}" resolved outside the registry`, 'high', 'direct'));
          } else if (!file.locked && FLOATING_NPM.test(spec)) {
            findings.push(at(index, `Dependency "${name}" pinned to a floating range`, 'low', 'local'));
          }
        }
      }

      return findings.sort((a, b) => a.line - b.line);
    }

    // requirements.txt is a line format and has to be read as one.
    for (const [index, raw] of file.lines.entries()) {
      const text = raw.trim();
      if (!text || text.startsWith('#')) continue;

      const editable = /^-(e|-editable)\b/.test(text);
      const body = text.replace(/^-(e|-editable)\s+/, '').split(/\s+(?:#|--)/)[0] ?? '';
      if (!body) continue;

      if (editable || NON_REGISTRY.test(body)) {
        // `#egg=name` where the line names one, else the last path segment: a
        // whole URL in the message crowds out the findings around it.
        const named = /#egg=([A-Za-z0-9._-]+)/.exec(body)?.[1] ?? body.split('/').pop() ?? body;
        findings.push(at(index, `Dependency "${named}" resolved outside the registry`, 'high', 'direct'));
        continue;
      }

      if (body.startsWith('-')) continue; // an option line, not a requirement
      if (!file.locked && !/(==|@)/.test(body)) {
        const name = /^[A-Za-z0-9._-]+/.exec(body)?.[0] ?? body;
        findings.push(at(index, `Dependency "${name}" pinned to a floating range`, 'low', 'local'));
      }
    }

    return findings;
  },
};

export const RULES: Rule[] = [
  hardcodedSecret,
  highEntropySecret,
  sqlInjection,
  commandInjection,
  missingAuth,
  jwtUnverified,
  piiInLogs,
  unmaskedPan,
  weakCrypto,
  plaintextTransport,
  missingRateLimit,
  missingIdempotency,
  supplyChain,
];

/** Runs every applicable rule over one parsed file, or just the ones given. */
export function runRules(file: ParsedFile, rules: readonly Rule[] = RULES): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const rule of rules) {
    try {
      if (rule.run) findings.push(...rule.run(file));
    } catch {
      // One malformed rule must not abandon the scan of a whole file; the other
      // rules still have something useful to say about it.
    }
  }
  return findings;
}

/** Runs every manifest rule over one dependency manifest, or just the ones given. */
export function runManifestRules(file: ManifestFile, rules: readonly Rule[] = RULES): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const rule of rules) {
    try {
      if (rule.runManifest) findings.push(...rule.runManifest(file));
    } catch {
      // Same contract as runRules: one bad rule does not abandon the file.
    }
  }
  return findings;
}

export { enclosing };
