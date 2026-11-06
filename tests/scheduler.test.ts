import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineEmitter, type ScanTrigger, type StateChange } from '../src/core/events.js';
import { Scheduler } from '../src/core/scheduler.js';

const HOUR = 60 * 60_000;

function setup() {
  const events = new EngineEmitter();
  const states: string[] = [];
  events.on('state', (s: StateChange) => states.push(`${s.state}#${s.scanNo}`));
  const calls: Array<[number, ScanTrigger]> = [];
  let release: (() => void) | null = null;
  const task = vi.fn((scanNo: number, trigger: ScanTrigger) => {
    calls.push([scanNo, trigger]);
    return new Promise<void>((resolve) => (release = resolve));
  });
  const scheduler = new Scheduler(HOUR, task, events);
  /** Lets the running scan finish and the scheduler move to "waiting". */
  const finishScan = async () => {
    release?.();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { scheduler, states, calls, finishScan };
}

describe('Scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes searching -> waiting and scans again after the interval', async () => {
    const { scheduler, states, calls, finishScan } = setup();
    scheduler.start();
    expect(scheduler.state).toBe('searching');
    await finishScan();
    expect(scheduler.state).toBe('waiting');
    expect(scheduler.nextScanAt).not.toBeNull();

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(calls).toEqual([[1, 'scheduled'], [2, 'scheduled']]);
    expect(states).toEqual(['searching#1', 'waiting#1', 'searching#2']);
    await finishScan();
    await scheduler.stop();
  });

  it('triggerNow starts a manual scan only while waiting', async () => {
    const { scheduler, calls, finishScan } = setup();
    scheduler.start();
    expect(scheduler.triggerNow()).toBe(false); // still searching
    await finishScan();

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(scheduler.triggerNow()).toBe(true);
    expect(scheduler.state).toBe('searching');
    expect(calls).toEqual([[1, 'scheduled'], [2, 'manual']]);

    // The old timer is gone; the next scheduled scan is one interval after the manual one.
    await finishScan();
    await vi.advanceTimersByTimeAsync(HOUR - 1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([[1, 'scheduled'], [2, 'manual'], [3, 'scheduled']]);
    await finishScan();
    await scheduler.stop();
  });

  it('stop waits for the running scan and prevents further scans', async () => {
    const { scheduler, states, calls, finishScan } = setup();
    scheduler.start();
    const stopped = scheduler.stop();
    expect(scheduler.triggerNow()).toBe(false);
    await finishScan();
    await stopped;
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(calls).toHaveLength(1);
    expect(states.at(-1)).toBe('stopped#1');
  });
});
