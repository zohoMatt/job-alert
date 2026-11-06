import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { identityKeys, mergePostings, roleKey } from '../src/core/merge.js';
import { summarizeLocations } from '../src/output/console-sink.js';
import { MatchLog } from '../src/store/match-log.js';
import type { NormalizedJob } from '../src/types.js';

const posting = (id: string, title: string, location: string, publishedAt: string, companyId = 'greenhouse:affirm'): NormalizedJob => ({
  key: `${companyId}:${id}`,
  jobId: id,
  ats: 'greenhouse',
  companyId,
  companyName: 'Affirm',
  title,
  url: `https://example.com/${id}`,
  locations: [location],
  workplaceType: null,
  department: null,
  employmentType: null,
  publishedAt,
  updatedAt: null,
  salary: null,
  description: `desc ${id}`,
});

describe('mergePostings', () => {
  it('merges same company + title (ignoring case and spacing), keeps others apart', () => {
    const merged = mergePostings([
      { job: posting('1', 'Senior SWE, Fullstack', 'Remote Canada', '2026-10-01T00:00:00Z'), hits: [{ keyword: 'remote', fields: ['location'] }] },
      { job: posting('2', 'senior  SWE, Fullstack ', 'Remote US', '2026-10-03T00:00:00Z'), hits: [{ keyword: 'remote', fields: ['location', 'description'] }] },
      { job: posting('3', 'Staff SWE', 'Remote US', '2026-10-02T00:00:00Z'), hits: [{ keyword: 'remote', fields: ['title'] }] },
      { job: posting('4', 'Senior SWE, Fullstack', 'Remote US', '2026-10-02T00:00:00Z', 'ashby:other'), hits: [{ keyword: 'remote', fields: ['location'] }] },
    ]);
    expect(merged).toHaveLength(3);

    const role = merged.find((m) => m.job.postings)!;
    expect(role.job.key).toBe(roleKey(role.job));
    expect(role.job.locations).toEqual(['Remote US', 'Remote Canada']); // newest posting first
    expect(role.job.url).toBe('https://example.com/2');
    expect(role.job.publishedAt).toBe('2026-10-03T00:00:00Z');
    expect(role.job.postings!.map((p) => p.jobId)).toEqual(['2', '1']);
    expect(role.hits).toEqual([{ keyword: 'remote', fields: ['location', 'description'] }]);

    expect(merged.find((m) => m.job.jobId === '3')!.job.postings).toBeUndefined();
  });

  it('dedupes identical locations', () => {
    const [m] = mergePostings([
      { job: posting('1', 'SWE', 'United States', '2026-10-01T00:00:00Z'), hits: [] },
      { job: posting('2', 'SWE', 'United States', '2026-10-02T00:00:00Z'), hits: [] },
    ]);
    expect(m!.job.locations).toEqual(['United States']);
    expect(m!.job.postings).toHaveLength(2);
  });
});

describe('MatchLog.isKnown', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('treats a role as known if it or any posting was logged, including old per-posting records', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'job-alert-'));
    const log = await MatchLog.open(path.join(dir, 'matches.jsonl'));

    // An old record: a single posting, logged before merging existed.
    const old = posting('1', 'Senior SWE', 'Remote US', '2026-10-01T00:00:00Z');
    await log.append([{ foundAt: '', scanNo: 1, keywords: [], hits: [], job: old }]);

    // Later the same role shows up with a second location: not new.
    const [merged] = mergePostings([
      { job: old, hits: [] },
      { job: posting('2', 'Senior SWE', 'Remote Canada', '2026-10-05T00:00:00Z'), hits: [] },
    ]);
    expect(log.isKnown(merged!.job)).toBe(true);

    // A reposted role (new id, same title) is not new either; a different title is.
    expect(log.isKnown(posting('9', 'Senior SWE', 'Remote UK', '2026-11-01T00:00:00Z'))).toBe(true);
    expect(log.isKnown(posting('8', 'Staff SWE', 'Remote US', '2026-11-01T00:00:00Z'))).toBe(false);

    // The same holds after reloading the file.
    const reloaded = await MatchLog.open(path.join(dir, 'matches.jsonl'));
    expect(reloaded.isKnown(merged!.job)).toBe(true);
    expect(identityKeys(merged!.job)).toContain(old.key);
  });
});

describe('summarizeLocations', () => {
  it('shows up to three locations', () => {
    expect(summarizeLocations(['Remote US', 'Remote Canada'], 2)).toBe('Remote US / Remote Canada');
    expect(summarizeLocations(['A', 'B', 'C', 'D', 'E'], 5)).toBe('A / B / C +2');
    expect(summarizeLocations([], 2)).toBe('2 postings');
  });
});
