import type { EngineEmitter, EngineState, ScanTrigger } from './events.js';

export type ScanTask = (scanNo: number, trigger: ScanTrigger) => Promise<void>;

/**
 * Runs `task` now, then again `intervalMs` after each run *started*. Uses a
 * setTimeout chain rather than setInterval so a slow run never overlaps the next.
 *
 * While waiting, `triggerNow()` starts a scan immediately; the next scheduled
 * scan is then `intervalMs` after that manual one.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private current: EngineState | 'new' = 'new';
  private scans = 0;
  private nextAt: Date | null = null;
  readonly startedAt = new Date();

  constructor(
    private readonly intervalMs: number,
    private readonly task: ScanTask,
    private readonly events: EngineEmitter,
  ) {}

  get state(): EngineState | 'new' {
    return this.current;
  }

  get scanCount(): number {
    return this.scans;
  }

  get nextScanAt(): Date | null {
    return this.nextAt;
  }

  start(): void {
    if (this.current !== 'new') return;
    void this.tick('scheduled');
  }

  /** Starts a scan now if waiting. Returns false if a scan is running or the scheduler stopped. */
  triggerNow(): boolean {
    if (this.current !== 'waiting') return false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.tick('manual');
    return true;
  }

  private async tick(trigger: ScanTrigger): Promise<void> {
    if (this.current === 'stopped') return;
    const scanNo = ++this.scans;
    const started = Date.now();
    this.setState('searching', null);

    this.running = this.task(scanNo, trigger).catch((error: Error) => {
      this.events.emit('scan:failed', { scanNo, error });
    });
    await this.running;
    this.running = null;
    if (this.isStopped()) return; // stop() may have run while awaiting

    const nextAt = new Date(Math.max(started + this.intervalMs, Date.now()));
    this.timer = setTimeout(() => void this.tick('scheduled'), nextAt.getTime() - Date.now());
    this.events.emit('idle', { nextScanAt: nextAt, runStartedAt: this.startedAt });
    this.setState('waiting', nextAt);
  }

  /** Cancels the next run and waits for the current one (if any) to finish. */
  async stop(): Promise<void> {
    if (this.current === 'stopped') return;
    this.current = 'stopped';
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running;
    this.setState('stopped', null);
    this.events.emit('run:stop', { startedAt: this.startedAt, stoppedAt: new Date(), scans: this.scans });
  }

  private isStopped(): boolean {
    return this.current === 'stopped';
  }

  private setState(state: EngineState, nextAt: Date | null): void {
    this.current = state;
    this.nextAt = nextAt;
    this.events.emit('state', { state, scanNo: this.scans, nextScanAt: nextAt });
  }
}
