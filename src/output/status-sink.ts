import pc from 'picocolors';
import type { EngineEmitter, StateChange } from '../core/events.js';
import { formatDuration, localTime } from '../core/time.js';
import { fit, type Terminal } from './terminal.js';

export interface StatusOptions {
  /** Single-key shortcuts are active: show "s: scan now" (while waiting) and "q: quit". */
  keys: boolean;
}

interface Progress {
  done: number;
  total: number;
  startedAt: number;
}

/** Plain-text status line (no colors), so it can be measured and cut to the terminal width. */
export function renderStatus(
  change: StateChange,
  progress: Progress | null,
  now: number,
  opts: StatusOptions,
): string {
  const quit = opts.keys ? 'q: quit' : 'Ctrl+C: quit';
  if (change.state === 'searching') {
    const parts = [`Searching · scan #${change.scanNo}`];
    if (progress) {
      parts.push(`${progress.done}/${progress.total} companies`, formatDuration(now - progress.startedAt));
    }
    parts.push(quit);
    return parts.join(' · ');
  }
  if (change.state === 'waiting' && change.nextScanAt) {
    const left = Math.max(0, change.nextScanAt.getTime() - now);
    const parts = [`Waiting · next scan at ${localTime(change.nextScanAt)} (in ${formatDuration(left)})`];
    if (opts.keys) parts.push('s: scan now');
    parts.push(quit);
    return parts.join(' · ');
  }
  return '';
}

/** Keeps the terminal's status line in sync with the engine state. */
export function attachStatusSink(events: EngineEmitter, term: Terminal, opts: StatusOptions): void {
  let change: StateChange | null = null;
  let progress: Progress | null = null;

  const draw = () => {
    if (!change || change.state === 'stopped') return '';
    const text = fit(renderStatus(change, progress, Date.now(), opts), term.width);
    return change.state === 'searching' ? pc.yellow(text) : pc.cyan(text);
  };

  events.on('scan:start', ({ startedAt }) => {
    progress = { done: 0, total: 0, startedAt: startedAt.getTime() };
  });
  events.on('scan:progress', ({ done, total }) => {
    if (progress) Object.assign(progress, { done, total });
    term.setStatus(draw);
  });
  events.on('state', (c) => {
    change = c;
    if (c.state === 'stopped') {
      term.setStatus(null);
      return;
    }
    if (c.state === 'waiting') progress = null;
    term.setStatus(draw);
  });
}
