import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearResults, describeResults } from '../src/store/results.js';

describe('describeResults / clearResults', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('counts and deletes only daily files and the match log', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'job-alert-'));
    await writeFile(path.join(dir, 'jobs-2026-11-05.md'), '# a');
    await writeFile(path.join(dir, 'jobs-2026-11-06.md'), '# b');
    await writeFile(path.join(dir, 'matches.jsonl'), '{"a":1}\n{"b":2}\n\n');
    await writeFile(path.join(dir, 'notes.md'), 'keep me');

    const found = await describeResults(dir);
    expect(found.dailyFiles.map((f) => path.basename(f))).toEqual(['jobs-2026-11-05.md', 'jobs-2026-11-06.md']);
    expect(found.matches).toBe(2);
    expect(found.files).toHaveLength(3);

    await clearResults(dir);
    expect(await readdir(dir)).toEqual(['notes.md']);
    expect((await describeResults(dir)).files).toEqual([]);
  });

  it('handles a missing output folder', async () => {
    const found = await describeResults(path.join(os.tmpdir(), 'job-alert-does-not-exist-12345'));
    expect(found).toEqual({ dailyFiles: [], matches: 0, files: [] });
  });
});
