import type { EngineEmitter } from '../core/events.js';
import { saveLastRun, type RunRecord } from '../store/last-run.js';

export interface RunRecordSink {
  /** Resolves once every queued write has finished. */
  flush(): Promise<void>;
}

/** Keeps data/last-run.json up to date: written at start, after each scan, and on stop. */
export function attachRunRecordSink(events: EngineEmitter, file?: string): RunRecordSink {
  let record: RunRecord | null = null;
  let queue: Promise<void> = Promise.resolve();

  const save = () => {
    if (!record) return;
    const snapshot = { ...record };
    queue = queue
      .then(() => saveLastRun(snapshot, file))
      .catch((err: Error) => console.error(`Could not save run record: ${err.message}`));
  };

  events.on('run:start', ({ startedAt }) => {
    record = { startedAt: startedAt.toISOString(), stoppedAt: null, lastScanAt: null, scans: 0, newMatches: 0 };
    save();
  });
  events.on('scan:end', (r) => {
    if (!record) return;
    record.scans = Math.max(record.scans, r.scanNo);
    record.lastScanAt = r.endedAt.toISOString();
    record.newMatches += r.newMatches.length;
    save();
  });
  events.on('run:stop', ({ stoppedAt }) => {
    if (!record) return;
    record.stoppedAt = stoppedAt.toISOString();
    save();
  });

  return { flush: () => queue };
}
