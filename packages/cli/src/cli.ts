#!/usr/bin/env node
/**
 * `finsec` entry point.
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

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('finsec')
    .description('A security & compliance linter for money-handling code')
    .version(VERSION, '-v, --version')
    .option('--api-url <url>', 'Core API base URL (env: FINSEC_API_URL)')
    .option('--ws-url <url>', 'WebSocket origin, when it differs from --api-url (env: FINSEC_WS_URL)')
    .option('--project <id>', 'project id (env: FINSEC_PROJECT_ID)')
    .option('--profile <name>', 'credential profile from ~/.config/finsec/config.toml')
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
    .option('--config <file>', 'explicit finsec.yaml to use')
    .option('--ruleset <name>', 'ruleset to run (repeatable)', collect)
    .option('--json', 'machine-readable JSON on stdout')
    .option('--sarif <file>', 'write SARIF 2.1.0 to a file')
    .option('--validate-secrets', 'check whether found secrets are still live (rate-limited)')
    .option('--report <format>', 'download a signed report: pdf | json')
    .option('--replay <fixture>', 'replay a recorded frame timeline instead of calling the API')
    .option('--max-findings <n>', 'stop rendering cards after n findings', (v) => Number.parseInt(v, 10))
    .action(async (path: string, options: Record<string, unknown>, command: Command) => {
      const { runScan } = await import('./commands/scan.js');
      await runScan(path, options, command.parent?.opts() ?? {});
    });

  program
    .command('fix')
    .description('Apply a Cerebus fix suggestion')
    .argument('[finding]', 'finding id or rule id, e.g. FIN-SEC-001')
    .option('--all', 'walk every matching finding')
    .option('--apply', 'write without prompting (implies non-interactive)')
    .action(async (finding: string | undefined, options: Record<string, unknown>, command: Command) => {
      const { runFix } = await import('./commands/fix.js');
      await runFix(finding, options, command.parent?.opts() ?? {});
    });

  // Commands below are scaffolded but not yet implemented. They exist so that
  // `finsec --help` shows the real surface and so nobody re-litigates the tree.
  const planned: Array<[string, string]> = [
    ['login', 'Authenticate and store credentials'],
    ['logout', 'Clear stored credentials'],
    ['init', 'Scaffold finsec.yaml and .finseclintrc'],
    ['triage', 'Review findings interactively'],
    ['watch', 'Re-scan on file change'],
    ['rules', 'List, show, validate, or test rules'],
    ['suppress', 'Suppress a rule with a reason and expiry'],
    ['baseline', 'Set or show the baseline'],
    ['report', 'Download a signed compliance report'],
    ['badge', 'Print the compliance badge URL and markdown'],
  ];

  for (const [name, description] of planned) {
    program
      .command(name, { hidden: false })
      .description(`${description} (not yet implemented)`)
      .allowUnknownOption()
      .action(() => {
        throw new CliError(`\`finsec ${name}\` is not implemented yet.`, {
          hint: 'Implemented so far: scan, fix.',
        });
      });
  }

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
  if (process.env.FINSEC_DEBUG && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n\n`);
  }
  return ExitCode.CLI_ERROR;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  program.exitOverride();

  try {
    await program.parseAsync(argv);
  } catch (error) {
    // Commander throws for --help and --version too; those are successful exits.
    const code = (error as { code?: string }).code;
    if (code === 'commander.helpDisplayed' || code === 'commander.help' || code === 'commander.version') {
      return;
    }
    if (code === 'commander.unknownCommand' || code === 'commander.unknownOption' || code === 'commander.missingArgument') {
      process.exitCode = ExitCode.CLI_ERROR;
      return;
    }
    process.exitCode = report(error);
  }
}

// `process.exitCode` rather than `process.exit()`, so buffered stdout is flushed
// before the process ends — otherwise piped output can be truncated.
await main();
