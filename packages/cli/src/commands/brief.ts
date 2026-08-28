/**
 * `sirius brief` — the one-document explanation, as a PDF or on the terminal.
 *
 * Exists because the tool is legible to somebody who already understands the
 * problem and opaque to somebody who does not, and the second group is most of
 * the people who will ever look at it. A feature list does not fix that. What
 * fixes it is stating the gap in a sentence a reader already believes, showing
 * one real attack end to end, and then the numbers.
 *
 * The PDF is written by hand, like the compliance report — a PDF is a text
 * format with a byte-offset table at the end, and its fourteen base fonts are in
 * every reader ever shipped. No renderer, no headless browser, no dependency
 * (D-035).
 */

import { existsSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { collectBriefFacts } from '../engine/brief.js';
import { plural } from '../ui/kit.js';
import { detectCapabilities } from '../ui/theme.js';
import type { BriefFacts } from '../engine/brief.js';

export interface BriefFlags {
  output?: string;
  plain?: boolean;
  json?: boolean;
  scan?: string;
}

interface GlobalFlags {
  color?: boolean;
}

const DIM = '\u001B[38;5;244m';
const BOLD = '\u001B[1m';
const RESET = '\u001B[0m';

export async function runBrief(flags: BriefFlags, globals: GlobalFlags): Promise<void> {
  // The demo fixture by default, so the code half of the brief has real numbers
  // rather than being omitted.
  const scanRoot = flags.scan ?? defaultFixture();
  const facts = await collectBriefFacts(scanRoot);

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
    return;
  }

  if (flags.plain) {
    const capabilities = detectCapabilities({ noColor: globals.color === false });
    process.stdout.write(renderPlain(facts, capabilities.color, capabilities.width, capabilities.unicode));
    return;
  }

  const { briefToPdf } = await import('../engine/brief-pdf.js');
  const pdf = briefToPdf(facts);

  const out = flags.output ?? 'sirius-brief.pdf';
  const path = isAbsolute(out) ? out : resolve(process.cwd(), out);
  writeFileSync(path, pdf);

  const kb = Math.max(1, Math.round(pdf.length / 1024));
  process.stdout.write(
    `\n  wrote ${path}  (${kb} KB)\n` +
      `  ${plural(facts.guard.actions, 'action')} judged, ` +
      `${(facts.guard.autonomy * 100).toFixed(1)}% proceeded with nobody asked\n\n` +
      `  Every figure in it came from that run. Read it on screen with --plain.\n\n`,
  );
}

/** The bundled fixture, so `sirius brief` works from anywhere in the repo. */
function defaultFixture(): string | undefined {
  const candidates = [
    resolve(process.cwd(), 'contract/fixtures/chaos-repo'),
    resolve(process.cwd(), '../contract/fixtures/chaos-repo'),
    resolve(process.cwd(), '../../contract/fixtures/chaos-repo'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * The same document, on the terminal.
 *
 * Not a summary of the PDF — the same argument in the same order, so a reader
 * who runs the command and a reader who opens the file end up having read the
 * same thing.
 */
function renderPlain(facts: BriefFacts, color: boolean, width: number, unicode: boolean): string {
  const paint = (text: string, style: string) => (color ? `${style}${text}${RESET}` : text);
  const wrap = (text: string, indent = '  '): string => {
    const room = Math.max(40, Math.min(width, 96) - indent.length);
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && `${line} ${word}`.length > room) {
        out.push(indent + line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(indent + line);
    return out.join('\n');
  };

  const g = facts.guard;
  // One convention per document. Signal text is written by the engine with `₹`,
  // so it is folded to match rather than sitting beside `Rs.` on the same page.
  const symbol = unicode ? '₹' : 'Rs.';
  const say = (text: string) => (unicode ? text : text.replace(/₹/g, 'Rs.'));
  const rupees = (paise: number) =>
    `${symbol}${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(paise / 100))}`;

  const parts: string[] = ['', `  ${paint('sirius', BOLD)}`];
  parts.push(paint('  A security and control layer for AI agents that can move money', DIM), '');

  parts.push(`  ${paint('THE PROBLEM', BOLD)}`, '');
  parts.push(
    wrap(
      'An AI agent with a wallet is a new kind of actor: it holds credentials, decides for itself, ' +
        'and signs its own transactions. A transaction can be correctly signed, properly ' +
        'authenticated, inside the agent’s own credentials — and still be a transfer it has ' +
        'never made, to a party it has never used, because a web page it read told it to.',
    ),
  );
  parts.push('', `  ${paint('Technical validity is not behavioural legitimacy.', BOLD)}`, '');
  parts.push(
    wrap(
      'Both obvious answers fail. Approve every action by hand and the agent is not autonomous — ' +
        'the operator has become the agent. Grant unrestricted authority and one manipulated ' +
        'instruction empties the account.',
    ),
    '',
  );

  parts.push(`  ${paint('SO THE ANSWER IS GRADUATED', BOLD)}`, '');
  for (const [word, meaning] of [
    ['ALLOW', 'proceeds untouched, nobody is asked'],
    ['VERIFY', 'unusual but plausible — a step-up, not a person'],
    ['CONSTRAIN', 'over a limit, so it proceeds smaller'],
    ['BLOCK', 'refused, and the operator is told which rule refused it'],
  ] as Array<[string, string]>) {
    parts.push(`    ${paint(word.padEnd(11), BOLD)}${paint(meaning, DIM)}`);
  }
  parts.push('');

  parts.push(`  ${paint('SIX QUESTIONS, ASKED OF EVERY ACTION', BOLD)}`, '');
  for (const [name, question] of [
    ['identity', 'is this kind of action inside the agent’s grant at all?'],
    ['intent', 'does its stated purpose match the objective it was given?'],
    ['policy', 'does it breach a spending, exposure or frequency limit?'],
    ['context', 'how risky is this counterparty, this contract, this amount?'],
    ['behaviour', 'is this consistent with how this agent has actually behaved?'],
    ['manipulation', 'can the instruction behind it be trusted?'],
  ] as Array<[string, string]>) {
    parts.push(`    ${paint(name.padEnd(14), BOLD)}${paint(question, DIM)}`);
  }
  parts.push('');

  if (g.injection) {
    parts.push(`  ${paint('A WORKED EXAMPLE', BOLD)}`, '');
    parts.push(`    ${paint(rupees(g.injection.amountPaise), BOLD)} to ${g.injection.counterparty}`);
    parts.push(paint(`    saying: "${g.injection.intent}"`, DIM));
    parts.push(paint(`    instruction arrived by ${g.injection.source}`, DIM), '');
    for (const signal of g.injection.signals) {
      parts.push(`    ${paint(signal.tier.toUpperCase().padEnd(10), BOLD)}${paint(say(signal.says), DIM)}`);
    }
    parts.push('', `    ${paint('BLOCKED', BOLD)}`);
    parts.push(
      wrap(
        'The amount was inside every limit and the transaction would have been valid. Nothing about ' +
          'the payment was wrong. What was wrong was where the instruction came from.',
        '    ',
      ),
      '',
    );
  }

  parts.push(`  ${paint('RESULTS', BOLD)}`, '');
  parts.push(
    `    ${paint(`${(g.autonomy * 100).toFixed(1)}%`, BOLD)} of ${g.actions} actions proceeded with nobody asked`,
  );
  parts.push(
    paint(
      `    ${g.counts.allow ?? 0} allowed   ${g.counts.verify ?? 0} stepped up   ` +
        `${g.counts.constrain ?? 0} constrained   ${g.counts.block ?? 0} blocked`,
      DIM,
    ),
  );
  parts.push(
    paint(`    ${rupees(g.stoppedPaise)} stopped   ${rupees(g.trimmedPaise)} trimmed`, DIM),
    '',
  );
  parts.push(
    `    ${paint(`${g.ordinaryIntervened} of ${g.ordinary}`, BOLD)} ordinary actions were interrupted`,
  );
  parts.push(
    wrap(
      'Both halves matter. A layer that catches every attack and interrupts routine work is one that ' +
        'gets switched off within a week.',
      '    ',
    ),
    '',
  );

  if (facts.scan) {
    parts.push(`  ${paint('IT ALSO SECURES THE CODE THE AGENT RUNS ON', BOLD)}`, '');
    parts.push(
      paint(
        `    ${facts.scan.rules} rules, each mapped to a compliance clause. On the demo fixture: ` +
          `${facts.scan.findings} findings, ${symbol}${new Intl.NumberFormat('en-IN').format(facts.scan.moneyInr)} ` +
          `at risk, score ${Math.round(facts.scan.score)}/100.`,
        DIM,
      ),
      '',
    );
  }

  parts.push(`  ${paint('WHAT IT DOES NOT DO', BOLD)}`, '');
  parts.push(
    wrap(
      'The intent check is word overlap, not a language model — a check that needs a network round ' +
        'trip fails open under load, which is the worst failure a control layer can have. Everything ' +
        'is simulated: no account is contacted and no funds move.',
      '    ',
    ),
    '',
  );

  parts.push(paint('  Written to PDF with `sirius brief`.', DIM), '');
  return parts.join('\n');
}
