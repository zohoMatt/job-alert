import readline from 'node:readline';

export interface KeyHandlers {
  onScanNow: () => void;
  onQuit: () => void;
}

/**
 * Listens for single key presses while the scheduler runs:
 *   s           -> scan now
 *   q / Ctrl+C  -> quit (raw mode swallows SIGINT, so Ctrl+C is handled here)
 * Works the same on macOS, Windows and Linux terminals. Does nothing when stdin
 * is not a TTY. Returns a function that stops listening and restores the terminal.
 */
export function listenForKeys(handlers: KeyHandlers): () => void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return () => {};

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  const onKeypress = (_str: string | undefined, key: readline.Key | undefined) => {
    if (!key || key.meta) return;
    if (key.ctrl) {
      if (key.name === 'c') handlers.onQuit();
      return;
    }
    if (key.name === 'q') handlers.onQuit();
    else if (key.name === 's') handlers.onScanNow();
  };
  stdin.on('keypress', onKeypress);

  return () => {
    stdin.off('keypress', onKeypress);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  };
}
