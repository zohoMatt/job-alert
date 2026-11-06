import type { EngineEmitter } from './events.js';

/**
 * Runs `task` now, then again `intervalMs` after each run *started*. Uses a
 * setTimeout chain rather than setInterval so a slow run never overlaps the next.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private scans = 0;
  readonly startedAt = new Date();

  constructor(
    private readonly intervalMs: number,
    private readonly task: (scanNo: number) => Promise<void>,
    private readonly events: EngineEmitter,
  ) {}

  start(): void {
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const scanNo = ++this.scans;
    const started = Date.now();
    this.running = this.task(scanNo).catch((error: Error) => {
      this.events.emit('scan:failed', { scanNo, error });
    });
    await this.running;
    this.running = null;
    if (this.stopped) return;
    const nextAt = Math.max(started + this.intervalMs, Date.now());
    this.events.emit('idle', { nextScanAt: new Date(nextAt), runStartedAt: this.startedAt });
    this.timer = setTimeout(() => void this.tick(), nextAt - Date.now());
  }

  /** Cancels the next run and waits for the current one (if any) to finish. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
    this.events.emit('run:stop', { startedAt: this.startedAt, stoppedAt: new Date(), scans: this.scans });
  }
}
