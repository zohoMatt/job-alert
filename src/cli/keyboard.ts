import readline from 'node:readline';

export interface KeyHandlers {
  onScanNow: () => void;
  onQuit: () => void;
}

/**
 * Listens for single key presses while the scheduler runs:
 *   s       -> scan now
 *   Ctrl+C  -> quit (raw mode swallows SIGINT, so it is handled here)
 * Does nothing when stdin is not a TTY. Returns a function that stops listening.
 */
export function listenForKeys(handlers: KeyHandlers): () => void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return () => {};

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  const onKeypress = (_str: string | undefined, key: readline.Key | undefined) => {
    if (!key) return;
    if (key.ctrl && key.name === 'c') handlers.onQuit();
    else if (key.name === 's' && !key.ctrl && !key.meta) handlers.onScanNow();
  };
  stdin.on('keypress', onKeypress);

  return () => {
    stdin.off('keypress', onKeypress);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  };
}
