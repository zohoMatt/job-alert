import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeLastRun } from '../src/cli/last-run-summary.js';
import { EngineEmitter, type ScanReport } from '../src/core/events.js';
import { attachRunRecordSink } from '../src/output/run-record-sink.js';
import { loadLastRun } from '../src/store/last-run.js';
import type { Company } from '../src/types.js';

const company = (id: string, name: string): Company => ({
  id,
  name,
  ats: 'greenhouse',
  token: id.split(':')[1]!,
  api: '',
  source: 'notion',
  resolvedBy: 'url',
  sampleUrls: [],
});

const known = [company('greenhouse:figma', 'Figma'), company('greenhouse:reddit', 'Reddit')];
const config = {
  intervalMinutes: 90,
  companyIds: ['greenhouse:figma', 'greenhouse:reddit', 'ashby:gone'],
  keywords: ['frontend', 'remote'],
};

describe('describeLastRun', () => {
  const start = new Date(2026, 10, 5, 9, 0, 0);

  it('describes a cleanly stopped run and the saved settings', () => {
    const record = {
      startedAt: start.toISOString(),
      stoppedAt: new Date(start.getTime() + 3 * 3600_000 + 5 * 60_000).toISOString(),
      lastScanAt: null,
      scans: 4,
      newMatches: 7,
    };
    const s = describeLastRun(record, config, known);
    expect(s.lines).toEqual([
      'Last run: 2026-11-05 09:00:00 -> 12:05:00 (ran 3h 5m 0s, 4 scans, 7 new matches)',
      '  Interval : every 90 min',
      '  Companies: 2 (Figma, Reddit)',
      '             1 no longer in companies.json: ashby:gone',
      '  Keywords : frontend AND remote',
    ]);
    expect(s.companies.map((c) => c.name)).toEqual(['Figma', 'Reddit']);
    expect(s.missingIds).toEqual(['ashby:gone']);
  });

  it('flags a run that never recorded a stop', () => {
    const record = { startedAt: start.toISOString(), stoppedAt: null, lastScanAt: start.toISOString(), scans: 1, newMatches: 0 };
    expect(describeLastRun(record, config, known).lines[0]).toContain('did not exit cleanly');
  });

  it('works without a run record', () => {
    expect(describeLastRun(null, config, known).lines[0]).toBe('  Interval : every 90 min');
  });
});

describe('attachRunRecordSink', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('records start, scans and stop', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'job-alert-'));
    const file = path.join(dir, 'last-run.json');
    const events = new EngineEmitter();
    const sink = attachRunRecordSink(events, file);
    const startedAt = new Date();

    events.emit('run:start', { startedAt, companies: [], keywords: ['x'], intervalMinutes: 60 });
    await sink.flush();
    expect((await loadLastRun(file))?.stoppedAt).toBeNull();

    const report = { scanNo: 1, endedAt: new Date(), newMatches: [{}, {}] } as unknown as ScanReport;
    events.emit('scan:end', report);
    events.emit('run:stop', { startedAt, stoppedAt: new Date(), scans: 1 });
    await sink.flush();

    const rec = await loadLastRun(file);
    expect(rec).toMatchObject({ scans: 1, newMatches: 2 });
    expect(rec?.stoppedAt).not.toBeNull();
  });
});
