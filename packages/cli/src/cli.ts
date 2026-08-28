#!/usr/bin/env node
/**
 * `sirius` entry point.
 *
 * Two responsibilities and no more: assemble the command tree, and funnel every
 * failure into a single exit-code decision. Commands throw; this file decides
 * what the shell sees.
 */

import { Command, InvalidArgumentError } from 'commander';

import { CliError } from './api/errors.js';
import { ExitCode, SEVERITIES } from './domain.js';
import type { ExitCodeValue } from './domain.js';

const VERSION = '0.4.0';

function severityArg(value: string): string {
  if (!SEVERITIES.includes(value as never)) {
    throw new InvalidArgumentError(`expected one of ${SEVERITIES.join(', ')}`);
  }
  return value;
}

function failOnArg(value: string): string {
  const allowed = ['all', 'new', 'verified-secrets'];
  if (!allowed.includes(value)) {
    throw new InvalidArgumentError(`expected one of ${allowed.join(', ')}`);
  }
  return value;
}

/**
 * A count, refused rather than silently coerced.
 *
 * `Number.parseInt('abc', 10)` is `NaN`, and every comparison against `NaN` is
 * false — so `--limit abc` printed an empty list with no error and exit 0, and
 * `--capacity -5` printed `room for -5` and carried on. Both look like the tool
 * answering the question rather than failing to understand it, which is the
 * worst of the three possible outcomes.
 *
 * Zero is allowed: `--capacity 0` and `--budget 0` are meaningful questions —
 * *what would this run do with nothing to spend?* — and the answer is a run
 * that refuses everything, which is exactly what the audit trail should show.
 */
function countArg(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`expected a whole number of 0 or more, got "${value}"`);
  }
  return parsed;
}

/** A fraction in [0,1], for the share-style options. */
function fractionArg(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError(`expected a fraction between 0 and 1, got "${value}"`);
  }
  return parsed;
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('sirius')
    .description('A security & compliance linter for money-handling code\n\nRun with no arguments to open an interactive shell.')
    .version(VERSION, '-v, --version')
    .option('--api-url <url>', 'Core API base URL (env: SIRIUS_API_URL)')
    .option('--ws-url <url>', 'WebSocket origin, when it differs from --api-url (env: SIRIUS_WS_URL)')
    .option('--project <id>', 'project id (env: SIRIUS_PROJECT_ID)')
    .option('--profile <name>', 'credential profile from ~/.config/sirius/config.toml')
    .option('--no-color', 'disable color (NO_COLOR is honored too)')
    .showHelpAfterError();

  program
    .command('scan')
    .description('Scan a path and stream findings')
    .argument('[path]', 'path to scan', '.')
    .option('--diff', 'only report findings absent from the baseline')
    .option('--baseline <sha>', 'baseline commit for diff-aware scanning')
    .option('--severity-threshold <level>', 'minimum severity that counts', severityArg)
    .option('--fail-on <predicate>', 'which findings block: all | new | verified-secrets', failOnArg)
    .option('--config <file>', 'explicit sirius.yaml to use')
    .option('--ruleset <name>', 'ruleset to run (repeatable)', collect)
    .option('--json', 'machine-readable JSON on stdout')
    .option('--sarif <file>', 'write SARIF 2.1.0 to a file')
    .option('--validate-secrets', 'check whether found secrets are still live (rate-limited)')
    .option('--report <format>', 'download a signed report: pdf | json')
    .option('--replay <fixture>', 'replay a recorded frame timeline instead of calling the API')
    .option('--local', 'force the built-in engine even when a project is configured')
    .option('--max-findings <n>', 'stop rendering cards after n findings', countArg)
    .action(async (path: string, options: Record<string, unknown>, command: Command) => {
      const { runScan } = await import('./commands/scan.js');
      await runScan(path, options, command.parent?.opts() ?? {});
    });

  program
    .command('fix')
    .description('Apply a Cerebus fix suggestion')
    .argument('[finding]', 'finding id or rule id, e.g. SIR-SEC-001')
    .option('--all', 'walk every matching finding')
    .option('--unsafe-fixes', 'also apply fixes that are not machine-applicable')
    .option('--apply', 'write without prompting (implies non-interactive)')
    .option('--dry-run', 'show the proposed fix and stop, writing nothing')
    .option('--target <dir>', 'the directory that was scanned, when it was not this one')
    .action(async (finding: string | undefined, options: Record<string, unknown>, command: Command) => {
      const { runFix } = await import('./commands/fix.js');
      await runFix(finding, options, command.parent?.opts() ?? {});
    });

  program
    .command('init')
    .description('Scaffold sirius.yaml and .siriusignore')
    .option('--force', 'overwrite existing config files')
    .option('--project <id>', 'project id to write into sirius.yaml')
    .action(async (options: Record<string, unknown>, command: Command) => {
      const { runInit } = await import('./commands/init.js');
      await runInit(options, command.parent?.opts() ?? {});
    });

  program
    .command('login')
    .description('Store an API key in ~/.config/sirius/config.toml')
    .option('--api-key <key>', 'the key to store (prompts if omitted)')
    .option('--no-verify', 'skip the health check before storing')
    .option('--list', 'list stored profiles instead of logging in')
    .action(async (options: Record<string, unknown>, command: Command) => {
      const { runLogin } = await import('./commands/auth.js');
      await runLogin(options, command.parent?.opts() ?? {});
    });

  program
    .command('logout')
    .description('Remove a stored profile')
    .action(async (_options: Record<string, unknown>, command: Command) => {
      const { runLogout } = await import('./commands/auth.js');
      await runLogout(command.parent?.opts() ?? {});
    });

  program
    .command('rules')
    .description('List, show, validate, or test rules')
    .argument('[subcommand]', 'list | show | validate | test', 'list')
    .argument('[target]', 'rule id for show, file path for validate and test')
    .option('--category <name>', 'filter by category')
    .option('--ruleset <name>', 'filter by ruleset')
    .option('--fixture <path>', 'the annotated file to run a rule against')
    .option('--json', 'machine-readable output')
    .action(async (sub: string, target: string | undefined, options: Record<string, unknown>, command: Command) => {
      const { runRules } = await import('./commands/rules.js');
      await runRules(sub, target, options, command.parent?.opts() ?? {});
    });

  program
    .command('suppress')
    .description('Suppress a rule, with a reason and an expiry')
    .argument('<rule>', 'rule id, e.g. SIR-SEC-010')
    .option('--reason <text>', 'why this is suppressed (required)')
    .option('--expires <date>', 'YYYY-MM-DD, so it gets revisited')
    .option('--path <glob>', 'limit the suppression to matching paths')
        .option('--target <dir>', 'the project to record the suppression in')
.action(async (rule: string, options: Record<string, unknown>, command: Command) => {
      const { runSuppress } = await import('./commands/governance.js');
      await runSuppress(rule, options, command.parent?.opts() ?? {});
    });

  program
    .command('baseline')
    .description('Set or show the baseline used by --fail-on new')
    .argument('[subcommand]', 'set | show', 'show')
    .option('--commit <sha>', 'commit to baseline against (defaults to HEAD)')
    .option('--scan <id>', 'scan to take fingerprints from (defaults to the last one)')
        .option('--target <dir>', 'the directory that was scanned, when it was not this one')
.action(async (sub: string, options: Record<string, unknown>, command: Command) => {
      const { runBaseline } = await import('./commands/governance.js');
      await runBaseline(sub, options, command.parent?.opts() ?? {});
    });

  program
    .command('report')
    .description('Produce or verify a signed compliance report')
    .argument('[scan-id]', 'scan to report on (defaults to the last one)')
    .option('--format <format>', 'pdf | json | sarif', 'json')
    .option('-o, --output <file>', 'where to write it')
    .option('--verify <file>', 'check a signed report instead of producing one')
    .option('--key <fingerprint>', 'require this signer — without it, a pass does not say who signed')
    .option('--target <dir>', 'the directory that was scanned, when it was not this one')
    .action(async (scanId: string | undefined, options: Record<string, unknown>, command: Command) => {
      const { runReport } = await import('./commands/governance.js');
      await runReport(scanId, options, command.parent?.opts() ?? {});
    });

  program
    .command('ledger')
    .description('The append-only log of reports, and proof it was never rewritten')
    .argument('[subcommand]', 'show | verify', 'show')
    .option('--json', 'machine-readable output')
    .action(async (sub: string, options: Record<string, unknown>, command: Command) => {
      const { runLedger } = await import('./commands/governance.js');
      await runLedger(sub, options, command.parent?.opts() ?? {});
    });

  program
    .command('badge')
    .description('Write the compliance badge, or print the hosted URL')
    .option('--no-markdown', 'print only the path or URL')
    .option('--output <file>', 'where to write the SVG (default .sirius/badge.svg)')
    .option('--target <dir>', 'the directory that was scanned, when it was not this one')
    .action(async (options: Record<string, unknown>, command: Command) => {
      const { runBadge } = await import('./commands/governance.js');
      await runBadge(options, command.parent?.opts() ?? {});
    });

  program
    .command('revenue')
    .description('Detect, diagnose and recover revenue at risk in a batch of records')
    .argument('[subcommand]', 'gen | detect | eval | recover | explain | sweep | watch | audit', 'detect')
    // No default: with one, `revenue explain` with no id reported `No record
    // "batch"` instead of asking which record. Each subcommand supplies its own
    // fallback, because they do not want the same one.
    .argument('[target]', 'batch directory — or, for `explain`, a record id')
    .option('--seed <value>', 'seed for `gen` — the same seed is the same batch')
    .option('--force', 'replace an existing batch that was generated differently')
    .option('--payments <n>', 'payments to generate', countArg)
    .option('--checkouts <n>', 'checkouts to generate', countArg)
    .option('--invoices <n>', 'invoices to generate', countArg)
    .option('--split <name>', 'test | train | all (default: test — the held-out half)')
    .option('--threshold <n>', 'override the score floor', countArg)
    .option('--capacity <n>', 'interventions available this run', countArg)
    .option('--limit <n>', 'rows to print', countArg)
    .option('--all', 'include records the agent would leave alone')
    .option('--kind <name>', 'show only payments, checkouts or invoices')
    .option('--model <file>', 'score with a model fitted elsewhere')
    .option('--budget <rupees>', 'cap what the run may spend', countArg)
    .option('--max-steps <n>', 'times one record may be worked', countArg)
    .option('--output <file>', 'where to write the audit trail')
    .option('--verify <file>', 'check a signed audit trail instead of running')
    .option('--key <fingerprint>', 'require this signer — without it, a pass does not say who signed')
    .option('--batch <dir>', 'batch directory, when the argument is a record id')
    .option('--seeds <n>', 'batches to sweep over (default 8)', countArg)
    .option('--capacity-share <fraction>', 'act on this share of each split, e.g. 0.05', fractionArg)
    .option('--save <file>', 'write the sweep, to compare a later run against')
    .option('--against <file>', 'compare this sweep with a saved one')
    .option('--debounce <ms>', 'quiet period for `watch`', countArg)
    .option('--json', 'machine-readable output')
    .action(async (subcommand: string, target: string, options: Record<string, unknown>, command: Command) => {
      const { runRevenue } = await import('./commands/revenue.js');
      await runRevenue(subcommand, target, options, command.parent?.opts() ?? {});
    });

  program
    .command('reconcile')
    .description('Match the ledger against gateway settlements and the bank statement')
    .argument('[books]', 'directory holding the three sets of books', 'books')
    .option('--gen', 'generate a set of books to reconcile')
    .option('--force', 'replace books that were generated differently')
    .option('--seed <value>', 'seed for --gen')
    .option('--orders <n>', 'captures to generate', countArg)
    .option('--limit <n>', 'exception lines to print per kind', countArg)
    .option('--exceptions', 'print every exception, not a sample')
    .option('--json', 'machine-readable output')
    .action(async (books: string, options: Record<string, unknown>, command: Command) => {
      const { runReconcile } = await import('./commands/reconcile.js');
      await runReconcile(books, options, command.parent?.opts() ?? {});
    });

  program
    .command('shell')
    .description('Open the interactive shell (the default when run with no arguments)')
    .action(async (options: Record<string, unknown>, command: Command) => {
      const { runShell } = await import('./commands/shell.js');
      await runShell(options, command.parent?.opts() ?? {});
    });

  program
    .command('explain')
    .description('Show how a money-at-risk figure was derived')
    .argument('[rule]', 'rule id, e.g. SIR-SEC-001; omit for the whole model')
    .option('--live', 'price it as a confirmed-live credential')
    .option('--json', 'machine-readable output')
    .action(async (rule: string | undefined, options: Record<string, unknown>, command: Command) => {
      const { runExplain } = await import('./commands/explain.js');
      await runExplain(rule, options, command.parent?.opts() ?? {});
    });

  program
    .command('doctor')
    .description('Check config, connectivity, and terminal before you rely on them')
    .action(async (options: Record<string, unknown>, command: Command) => {
      const { runDoctor } = await import('./commands/doctor.js');
      await runDoctor(options, command.parent?.opts() ?? {});
    });

  program
    .command('triage')
    .description('Review findings interactively (j/k move, a/d/s decide, / filter)')
    .option('--scan <id>', 'scan to review (defaults to the last one)')
    .option('--severity <level>', 'only review findings at this severity')
    .option('--all', 'include findings already decided')
    .option('--target <dir>', 'the directory that was scanned, when it was not this one')
    .action(async (options: Record<string, unknown>, command: Command) => {
      const { runTriage } = await import('./commands/triage.js');
      await runTriage(options, command.parent?.opts() ?? {});
    });

  program
    .command('watch')
    .description('Re-scan on file change')
    .argument('[path]', 'path to watch', '.')
    .option('--debounce <ms>', 'quiet period after a change', countArg)
    .option('--severity-threshold <level>', 'minimum severity that counts', severityArg)
    .option('--fail-on <predicate>', 'which findings block: all | new | verified-secrets', failOnArg)
    .option('--ruleset <name>', 'ruleset to run (repeatable)', collect)
    .option('--replay <fixture>', 'replay a recorded timeline instead of calling the API')
    .action(async (path: string, options: Record<string, unknown>, command: Command) => {
      const { runWatch } = await import('./commands/watch.js');
      await runWatch(path, options, command.parent?.opts() ?? {});
    });

  return program;
}

function report(error: unknown): ExitCodeValue {
  if (error instanceof CliError) {
    process.stderr.write(`\nerror: ${error.message}\n`);
    if (error.code) process.stderr.write(`  code: ${error.code}\n`);
    if (error.hint) process.stderr.write(`  ${error.hint}\n`);
    process.stderr.write('\n');
    return error.exitCode;
  }

  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\nerror: ${message}\n\n`);
  if (process.env.SIRIUS_DEBUG && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n\n`);
  }
  return ExitCode.CLI_ERROR;
}

/**
 * Every command resolves config from the working directory, so a deleted one is
 * fatal — but Node reports it as a bare `uv_cwd` ENOENT that says nothing about
 * what to do. Check once, up front, and explain.
 */
function assertWorkingDirectory(): void {
  try {
    process.cwd();
  } catch {
    process.stderr.write(
      '\nerror: the current directory no longer exists.\n' +
        '  It was deleted or replaced while this shell was inside it.\n' +
        '  Run `cd "$PWD"` — or cd somewhere that exists — and try again.\n\n',
    );
    process.exit(ExitCode.CLI_ERROR);
  }
}

/**
 * `sirius rules list | head -1` used to end in a Node stack trace.
 *
 * When the reader closes the pipe early — `head`, `grep -q`, quitting `less` —
 * the next write fails with EPIPE, and an unhandled stream error takes the
 * process down loudly. Every command here writes more than a screenful of
 * something, so this was reachable from almost all of them. Reading part of the
 * output is a normal thing to do; stop writing and leave quietly, which is what
 * every other CLI in the pipeline does.
 */
function exitQuietlyOnClosedPipe(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') process.exit(0);
      throw error;
    });
  }
}

export async function main(argv: string[] = process.argv): Promise<void> {
  exitQuietlyOnClosedPipe();
  assertWorkingDirectory();

  const program = buildProgram();

  // Every command, not just the root. `exitOverride` applies to the command it
  // is called on, and the subcommands were all constructed inside
  // `buildProgram` before this ran — so they kept commander's default
  // `process.exit(1)` and a mistyped flag came back as exit 1, the code this
  // CLI documents as "findings at or above threshold". A pipeline could not
  // tell a blocked gate from a typo, and `sirius scan . || true` — the escape
  // hatch in the README — swallowed the typo entirely and went green having
  // scanned nothing.
  //
  // `showHelpAfterError` rather than the full help body: commander's default
  // prints twenty-five lines of options after the error, which on a short
  // terminal scrolls the one line that matters off the top.
  const applyExitOverride = (command: Command): void => {
    command.exitOverride();
    command.showHelpAfterError(`(run \`${command.name()} --help\` for options)`);
    for (const child of command.commands) applyExitOverride(child as Command);
  };
  applyExitOverride(program);

  // Bare `sirius` in a terminal opens the shell rather than printing help.
  // Piped or redirected, it still prints help, so scripts and `sirius | less`
  // behave as before.
  const hasArgs = argv.slice(2).length > 0;
  if (!hasArgs && process.stdout.isTTY && process.stdin.isTTY) {
    argv = [...argv, 'shell'];
  }

  try {
    await program.parseAsync(argv);
  } catch (error) {
    // Commander throws for --help and --version too; those are successful exits.
    const code = (error as { code?: string }).code;
    if (code === 'commander.helpDisplayed' || code === 'commander.help' || code === 'commander.version') {
      return;
    }
    // Every commander failure, not a list of three.
    //
    // Commander has already written the message itself, so re-reporting it
    // produced `error: error: option '--limit <n>' argument 'abc' is invalid`.
    // The list named `unknownCommand`, `unknownOption` and `missingArgument`
    // and missed `invalidArgument`, which is what an option's own parser
    // throws — so the codes added here for validating numbers arrived
    // double-printed. Matching the prefix means the next one commander adds is
    // handled before anyone sees it twice.
    if (typeof code === 'string' && code.startsWith('commander.')) {
      process.exitCode = ExitCode.CLI_ERROR;
      return;
    }
    process.exitCode = report(error);
  }
}

// `process.exitCode` rather than `process.exit()`, so buffered stdout is flushed
// before the process ends — otherwise piped output can be truncated.
await main();
