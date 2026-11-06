/**
 * Terminal output with an optional sticky status line at the bottom.
 * Log lines are printed above the status line, which is redrawn after each one
 * and refreshed every second (for countdowns). When stdout is not a TTY
 * (piped or redirected), the status line is disabled and logs print as usual.
 */
export class Terminal {
  readonly interactive: boolean;
  private render: (() => string) | null = null;
  private ticker: NodeJS.Timeout | null = null;

  constructor(private readonly out: NodeJS.WriteStream = process.stdout) {
    this.interactive = !!out.isTTY;
  }

  log(text = ''): void {
    if (!this.interactive) {
      console.log(text);
      return;
    }
    this.clearLine();
    this.out.write(text + '\n');
    this.draw();
  }

  /** Sets the status line. `render` is called on every redraw. Pass null to remove it. */
  setStatus(render: (() => string) | null): void {
    this.render = render;
    if (!this.interactive) return;
    if (render && !this.ticker) {
      this.ticker = setInterval(() => this.draw(), 1_000);
      this.ticker.unref();
    }
    if (!render && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (render) this.draw();
    else this.clearLine();
  }

  private draw(): void {
    if (!this.render) return;
    this.clearLine();
    this.out.write(this.render());
  }

  private clearLine(): void {
    this.out.write('\r\x1b[2K');
  }

  /** Visible width available for the status line (one column spare to avoid wrapping). */
  get width(): number {
    return Math.max(20, (this.out.columns ?? 80) - 1);
  }
}

/** Cuts `text` to `width` visible characters. `text` must not contain ANSI codes. */
export function fit(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…';
}
