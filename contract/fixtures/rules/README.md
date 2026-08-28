# Authoring a rule, and proving it works

Two rules in the PRD's own YAML format, each with the fixture that tests it.
Both are runnable:

```bash
sirius rules validate contract/fixtures/rules/sql.yaml   # structure and clauses
sirius rules test     contract/fixtures/rules/sql.yaml   # does it actually fire?
```

`validate` checks what this repo owns — the `SIR-SEC-NNN` numbering blocks, the
category and severity vocabularies, the fix-action list, the PCI-DSS v4.0 clause
numbers. It says nothing about whether the pattern matches.

`test` answers that, by running the rule.

## The fixture annotates its own expectations

Semgrep's convention, because it is a good one:

```python
# sirius-test: SIR-SEC-003      the next line MUST match
STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Cexam"

# sirius-ok: SIR-SEC-003        the next line must NOT match
STRIPE_KEY = os.environ["STRIPE_SECRET_KEY"]
```

The fixture is readable on its own, and reviewing it is reviewing the rule. A
rule that fires on everything fails, because the `sirius-ok` lines fail.

The fixture is found automatically when it sits beside the rule with the same
name (`sql.yaml` → `sql.py`); otherwise pass `--fixture <path>`.

## What the interpreter can run

| clause | support |
|---|---|
| `regex` | full, per line |
| `entropy: { min_bits }` | full — Shannon bits over string literals on the line |
| `pattern` | a metavariable subset: `$X` matches one node, `"..."` matches any string |
| `pattern-either` | any of the alternatives |
| `patterns` | all of them |

**It is not Semgrep.** A pattern outside that subset is reported as
`unsupported` and the run fails — it is never treated as passing. A clause
nobody executed cannot be evidence the rule is right, and reporting a green
result for one is how a rule tester becomes worse than no rule tester.
