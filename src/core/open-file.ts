import { spawn } from 'node:child_process';

/**
 * The OS command that opens a file in its default app:
 *   macOS   -> open <file>
 *   Windows -> explorer.exe <file>   (no cmd.exe "start" quoting pitfalls with spaces)
 *   Linux   -> xdg-open <file>
 */
export function openCommand(file: string, platform: NodeJS.Platform = process.platform): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [file] };
  if (platform === 'win32') return { cmd: 'explorer.exe', args: [file] };
  return { cmd: 'xdg-open', args: [file] };
}

/**
 * Opens `file` with the default app, without waiting for it. Resolves true once the
 * opener started, false if it could not be started (e.g. xdg-open not installed).
 */
export function openFile(file: string): Promise<boolean> {
  const { cmd, args } = openCommand(file);
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
