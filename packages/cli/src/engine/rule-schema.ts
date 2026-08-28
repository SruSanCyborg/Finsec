/**
 * Structural validation of a rule YAML, with no server in the loop.
 *
 * `sirius rules validate` posted the file to `POST /rules/validate` and could
 * say nothing at all without a backend — which is the wrong way round. Almost
 * everything worth checking about a rule is a convention *this repo* owns: the
 * `SIR-SEC-NNN` numbering blocks, the category and severity vocabularies, the
 * fix-action list, and the PCI-DSS clause numbers that v4.0 renumbered. None of
 * that needs a network round trip, and an author writing a rule wants the
 * answer in the same second they saved the file.
 *
 * The line the server still owns is semantics: whether a `pattern` actually
 * compiles and matches what the author thinks it matches. This module makes no
 * claim about that, and `rules validate` says so rather than implying a pass
 * here is a pass everywhere.
 */

import { parse as parseYaml } from 'yaml';

import { localRuleIds } from './catalog.js';

export interface RuleProblem {
  /** Where in the document, in dotted form: `rule.metadata.compliance.pci_dss[0]`. */
  path: string;
  message: string;
  /** Errors make the rule invalid; warnings are conventions worth following. */
  severity: 'error' | 'warning';
  hint?: string;
}

export interface RuleValidation {
  valid: boolean;
  problems: RuleProblem[];
  /** The rule's id, once it is known well enough to name in the output. */
  id?: string;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const CATEGORIES = ['secrets', 'auth', 'injection', 'pii', 'crypto', 'logging', 'ratelimit', 'supplychain'];
const FIX_ACTIONS = [
  'env_lookup',
  'parameterize_query',
  'sanitize_input',
  'add_auth_decorator',
  'enforce_jwt_verify',
  'redact_pii_log',
  'tokenize_pan',
  'upgrade_crypto',
  'enforce_tls',
  'add_rate_limit',
  'add_idempotency_key',
  'pin_or_remove_dep',
];

/** Languages the engine can parse. A rule for anything else never fires. */
const LANGUAGES = ['python', 'javascript', 'typescript', 'go'];

/**
 * Rule ids are numbered in blocks of ten by category, so the id says what the
 * rule is about before anyone reads it. A mismatch is not fatal — the rule
 * still runs — but it breaks the one property the scheme exists for.
 */
const ID_BLOCKS: Record<string, string> = {
  '00': 'secrets',
  '01': 'injection',
  '02': 'auth',
  '03': 'pii',
  '04': 'crypto',
  '05': 'ratelimit',
  '06': 'supplychain',
};

/**
 * PCI-DSS numbers that v4.0 retired, and what they became.
 *
 * Worth its own check because a compliance linter citing a superseded clause is
 * wrong in the way that matters most to it: an auditor reads the clause number,
 * not the finding text.
 */
const RENUMBERED_PCI: Record<string, string> = {
  '6.5.1': '6.2.4',
  '6.5': '6.2.4',
  '8.3.1': '8.4.2',
  '8.3.2': '8.4.2',
  '8.3': '8.4.2',
  '8.2.1': '8.6.2',
};

export function validateRuleDocument(source: string): RuleValidation {
  const problems: RuleProblem[] = [];
  const error = (path: string, message: string, hint?: string) =>
    problems.push({ path, message, severity: 'error', ...(hint ? { hint } : {}) });
  const warn = (path: string, message: string, hint?: string) =>
    problems.push({ path, message, severity: 'warning', ...(hint ? { hint } : {}) });

  let document: unknown;
  try {
    document = parseYaml(source);
  } catch (failure) {
    return {
      valid: false,
      problems: [
        {
          path: '',
          message: failure instanceof Error ? failure.message.split('\n')[0] ?? 'not valid YAML' : 'not valid YAML',
          severity: 'error',
        },
      ],
    };
  }

  if (!isRecord(document)) {
    return { valid: false, problems: [{ path: '', message: 'expected a YAML mapping', severity: 'error' }] };
  }

  // The PRD wraps every rule in a `rule:` key. Accept a bare document too — it
  // is an obvious thing to write — but say which one this is.
  const rule = isRecord(document.rule) ? document.rule : document;
  if (!isRecord(document.rule)) {
    warn('', 'no `rule:` key — reading the document as the rule itself', 'Wrap it in `rule:` to match the catalogue.');
  }

  // ---- identity

  const id = typeof rule.id === 'string' ? rule.id.trim() : undefined;
  if (!id) {
    error('rule.id', 'missing', 'Rule ids look like SIR-SEC-001.');
  } else if (!/^SIR-SEC-\d{3}$/.test(id)) {
    error('rule.id', `"${id}" is not a SIR-SEC-NNN id`, 'e.g. SIR-SEC-012. Three digits, numbered in blocks of ten.');
  } else if (localRuleIds().includes(id)) {
    error('rule.id', `${id} is already the id of a compiled rule`, 'Pick an unused number in the same block.');
  }

  const category = typeof rule.category === 'string' ? rule.category : undefined;
  if (!category) {
    error('rule.category', 'missing', `One of: ${CATEGORIES.join(', ')}.`);
  } else if (!CATEGORIES.includes(category)) {
    error('rule.category', `"${category}" is not a category`, `One of: ${CATEGORIES.join(', ')}.`);
  }

  if (id && category && /^SIR-SEC-\d{3}$/.test(id)) {
    const block = id.slice(-3, -1);
    const expected = ID_BLOCKS[block];
    // `logging` shares the pii block by design — SIR-SEC-030 is "PII written to
    // logs" and is categorised either way in the PRD's own table.
    const agrees = expected === category || (expected === 'pii' && category === 'logging');
    if (expected && !agrees) {
      warn(
        'rule.id',
        `${id} sits in the ${block}x block, which is ${expected}, but the category is ${category}`,
        `${category} rules are numbered ${blockFor(category)}x.`,
      );
    } else if (!expected) {
      warn('rule.id', `the ${block}x block is not assigned to a category yet`, 'Assigned blocks: 00x–06x.');
    }
  }

  // ---- what it reports

  const severity = typeof rule.severity === 'string' ? rule.severity : undefined;
  if (!severity) {
    error('rule.severity', 'missing', `One of: ${SEVERITIES.join(', ')}.`);
  } else if (!SEVERITIES.includes(severity)) {
    error('rule.severity', `"${severity}" is not a severity`, `One of: ${SEVERITIES.join(', ')}.`);
  }

  const message = typeof rule.message === 'string' ? rule.message.trim() : '';
  if (!message) {
    error('rule.message', 'missing', 'This is the line the developer reads. Say what is wrong, not which rule fired.');
  } else if (message.length > 120) {
    warn('rule.message', `${message.length} characters is long for one line`, 'Findings render it on a single line.');
  }

  const languages = rule.languages;
  if (languages !== undefined) {
    if (!Array.isArray(languages)) {
      error('rule.languages', 'expected a list', 'e.g. [python, javascript]');
    } else {
      for (const [index, language] of languages.entries()) {
        if (typeof language !== 'string' || !LANGUAGES.includes(language)) {
          warn(
            `rule.languages[${index}]`,
            `the engine cannot parse "${String(language)}", so this rule would never fire`,
            `Parsed today: ${LANGUAGES.join(', ')}.`,
          );
        }
      }
    }
  }

  // ---- how it matches

  const match = isRecord(rule.match) ? rule.match : undefined;
  if (!match) {
    error('rule.match', 'missing', 'A rule with nothing to match against reports nothing.');
  } else {
    const hasMatcher =
      match.pattern !== undefined ||
      match.patterns !== undefined ||
      match['pattern-either'] !== undefined ||
      match.regex !== undefined;
    if (!hasMatcher) {
      error('rule.match', 'no pattern, patterns, pattern-either or regex', 'One of these has to be present.');
    }

    if (typeof match.kind === 'string' && !/^(ast|regex)(\s*\+\s*(ast|regex))?$/.test(match.kind.trim())) {
      warn('rule.match.kind', `"${match.kind}" is unusual`, 'The catalogue uses: ast, regex, or "ast + regex".');
    }

    const check = isRecord(match.validity_check) ? match.validity_check : undefined;
    if (check) {
      const method = typeof check.method === 'string' ? check.method.toUpperCase() : undefined;
      // Validation calls a third party with someone's leaked credential. A
      // non-GET probe could move money with the very key it is testing.
      if (method && method !== 'GET' && method !== 'HEAD') {
        error(
          'rule.match.validity_check.method',
          `${method} is not a read-only method`,
          'A validity check must never be able to change state with the key it is testing.',
        );
      }
      if (typeof check.endpoint === 'string' && check.endpoint.startsWith('http://')) {
        error('rule.match.validity_check.endpoint', 'plaintext HTTP would put the credential on the wire');
      }
    }
  }

  // ---- what it maps to, and what it offers

  const metadata = isRecord(rule.metadata) ? rule.metadata : undefined;
  const compliance = metadata && isRecord(metadata.compliance) ? metadata.compliance : undefined;

  if (!compliance) {
    warn(
      'rule.metadata.compliance',
      'no clause mapping',
      'A finding with no clause is a bug report, not a compliance finding.',
    );
  } else {
    const pci = compliance.pci_dss;
    if (Array.isArray(pci)) {
      for (const [index, clause] of pci.entries()) {
        const value = String(clause);
        const replacement = RENUMBERED_PCI[value];
        if (replacement) {
          error(
            `rule.metadata.compliance.pci_dss[${index}]`,
            `${value} is a v3.2.1 number; v4.0 renumbered it to ${replacement}`,
            'Cite the version the report claims to map to.',
          );
        } else if (!/^\d+(\.\d+){0,2}$/.test(value)) {
          warn(`rule.metadata.compliance.pci_dss[${index}]`, `"${value}" is not a requirement number`);
        }
      }
    } else if (pci !== undefined) {
      error('rule.metadata.compliance.pci_dss', 'expected a list of requirement numbers');
    }
  }

  const fix = isRecord(rule.fix) ? rule.fix : undefined;
  const action = fix && typeof fix.action === 'string' ? fix.action : undefined;
  const remediation = metadata && typeof metadata.remediation_action === 'string' ? metadata.remediation_action : undefined;

  for (const [path, value] of [
    ['rule.fix.action', action],
    ['rule.metadata.remediation_action', remediation],
  ] as const) {
    if (value && !FIX_ACTIONS.includes(value)) {
      error(path, `"${value}" is not a fix action`, `The vocabulary is fixed: ${FIX_ACTIONS.slice(0, 4).join(', ')}, …`);
    }
  }

  if (action && remediation && action !== remediation) {
    error('rule.fix.action', `disagrees with metadata.remediation_action (${remediation})`);
  }

  if (id && typeof rule.suppress === 'string' && !rule.suppress.includes(id)) {
    warn('rule.suppress', `the token does not name ${id}`, `Convention: "# sirius-ignore: ${id}".`);
  }

  return {
    valid: !problems.some((problem) => problem.severity === 'error'),
    problems,
    ...(id ? { id } : {}),
  };
}

/** The numbering block a category belongs to, for the hint text. */
function blockFor(category: string): string {
  const found = Object.entries(ID_BLOCKS).find(([, name]) => name === category);
  return found ? found[0] : '0?';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
