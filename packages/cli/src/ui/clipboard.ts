/**
 * Writing to the system clipboard.
 *
 * Needed because capturing the mouse takes the terminal's own copy-on-select
 * away: the selection then lives inside this process, and unless we hand it to
 * the clipboard ourselves the user has selected nothing they can paste.
 */

import { spawn } from 'node:child_process';

interface Copier {
  command: string;
  args: string[];
}

/**
 * The first copier that fits the platform.
 *
 * Wayland before X11 because a Wayland session usually still has xclip present
 * through XWayland, where it writes to a selection nothing will read.
 */
function copierFor(): Copier | undefined {
  if (process.platform === 'darwin') return { command: 'pbcopy', args: [] };

  if (process.platform === 'win32') {
    return { command: 'clip', args: [] };
  }

  if (process.env.WAYLAND_DISPLAY) return { command: 'wl-copy', args: [] };
  if (process.env.DISPLAY) return { command: 'xclip', args: ['-selection', 'clipboard'] };

  return undefined;
}

/**
 * Copies text, resolving to whether it landed.
 *
 * Never throws: a missing clipboard tool is a degraded copy, not a reason to
 * take down the shell mid-selection.
 */
export function copyToClipboard(text: string): Promise<boolean> {
  const copier = copierFor();
  if (!copier || !text) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let child;
    try {
      child = spawn(copier.command, copier.args, { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      resolve(false);
      return;
    }

    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));

    child.stdin?.on('error', () => resolve(false));
    child.stdin?.end(text);
  });
}

/** Whether a clipboard tool is available, for telling the user what to expect. */
export function clipboardAvailable(): boolean {
  return copierFor() !== undefined;
}
