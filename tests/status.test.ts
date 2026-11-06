import { describe, expect, it } from 'vitest';
import { renderStatus } from '../src/output/status-sink.js';
import { fit } from '../src/output/terminal.js';

describe('renderStatus', () => {
  const now = new Date(2026, 10, 5, 14, 0, 0).getTime();

  it('shows progress and the quit key while searching', () => {
    const text = renderStatus(
      { state: 'searching', scanNo: 3, nextScanAt: null },
      { done: 12, total: 44, startedAt: now - 4_000 },
      now,
      { keys: true },
    );
    expect(text).toBe('Searching · scan #3 · 12/44 companies · 4s · q: quit');
  });

  it('shows the countdown and key hints while waiting', () => {
    const next = new Date(now + 59 * 60_000 + 12_000);
    const change = { state: 'waiting' as const, scanNo: 3, nextScanAt: next };
    expect(renderStatus(change, null, now, { keys: true })).toBe(
      'Waiting · next scan at 14:59:12 (in 59m 12s) · s: scan now · q: quit',
    );
  });

  it('falls back to Ctrl+C when single keys are not available', () => {
    const change = { state: 'waiting' as const, scanNo: 1, nextScanAt: new Date(now + 1000) };
    const text = renderStatus(change, null, now, { keys: false });
    expect(text).not.toContain('s: scan now');
    expect(text).toContain('Ctrl+C: quit');
  });
});

describe('fit', () => {
  it('cuts long text to the width', () => {
    expect(fit('abcdef', 10)).toBe('abcdef');
    expect(fit('abcdefghijkl', 6)).toHaveLength(6);
  });
});
