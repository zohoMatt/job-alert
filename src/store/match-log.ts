import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { KeywordHit } from '../matching/types.js';
import { identityKeys } from '../core/merge.js';
import type { NormalizedJob } from '../types.js';
import { readTextIfExists } from './fs-utils.js';
import { paths } from './paths.js';

/** One line of output/matches.jsonl. */
export interface MatchRecord {
  foundAt: string;
  scanNo: number;
  keywords: string[];
  hits: KeywordHit[];
  job: NormalizedJob;
}

/**
 * The machine-readable output log (JSON Lines). It is also the memory of what has
 * already been reported: a matching job is "new" when its key is not in this file.
 * Deleting the file makes every current match new again.
 */
export class MatchLog {
  private keys = new Set<string>();

  private constructor(readonly file: string) {}

  static async open(file = paths.matchLog): Promise<MatchLog> {
    const log = new MatchLog(file);
    const text = await readTextIfExists(file);
    for (const line of text?.split('\n') ?? []) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as Partial<MatchRecord>;
        if (rec.job?.key) log.remember(rec.job);
      } catch {
        // Ignore a corrupt line (e.g. from a crash mid-write) instead of refusing to start.
      }
    }
    return log;
  }

  get size(): number {
    return this.keys.size;
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  /** True when the job, its role (company + title) or any of its postings was reported before. */
  isKnown(job: NormalizedJob): boolean {
    return identityKeys(job).some((k) => this.keys.has(k));
  }

  private remember(job: NormalizedJob): void {
    for (const k of identityKeys(job)) this.keys.add(k);
  }

  async append(records: MatchRecord[]): Promise<void> {
    if (records.length === 0) return;
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    for (const r of records) this.remember(r.job);
  }
}
