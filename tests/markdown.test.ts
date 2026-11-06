import { describe, expect, it } from 'vitest';
import { dailyHeader, ENTRIES_MARKER, prependSection } from '../src/output/markdown.js';

describe('prependSection', () => {
  const date = new Date(2026, 10, 5, 9, 0, 0);

  it('creates the header on a new file', () => {
    const out = prependSection(null, '## 09:00 · Scan #1', date);
    expect(out.startsWith('# Job Alert · 2026-11-05\n\n' + ENTRIES_MARKER)).toBe(true);
    expect(out).toContain('## 09:00 · Scan #1');
  });

  it('puts the newest section first, below the header', () => {
    let out = prependSection(null, '## first', date);
    out = prependSection(out, '## second', date);
    expect(out.indexOf('## second')).toBeLessThan(out.indexOf('## first'));
    expect(out.indexOf(ENTRIES_MARKER)).toBeLessThan(out.indexOf('## second'));
    expect(out.match(/# Job Alert/g)).toHaveLength(1);
  });

  it('keeps a file that lost its marker', () => {
    const out = prependSection('hand-written notes\n', '## new', date);
    expect(out.startsWith(dailyHeader(date).trim())).toBe(true);
    expect(out).toContain('hand-written notes');
  });
});
