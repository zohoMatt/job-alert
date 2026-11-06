import pLimit from 'p-limit';
import type { Matcher } from '../matching/types.js';
import { getProvider } from '../providers/registry.js';
import type { MatchLog, MatchRecord } from '../store/match-log.js';
import type { Company, NormalizedJob } from '../types.js';
import type { CompanyError, ScanReport } from './events.js';

export interface ScanOptions {
  scanNo: number;
  companies: Company[];
  matcher: Matcher;
  keywords: string[];
  log: MatchLog;
  concurrency?: number;
}

/**
 * One pass: fetch every company's board, match every job, and return the
 * matches that are not in the match log yet. Does not write anything.
 */
export async function runScan(opts: ScanOptions): Promise<ScanReport> {
  const startedAt = new Date();
  const limit = pLimit(opts.concurrency ?? 5);
  const errors: CompanyError[] = [];

  const perCompany = await Promise.all(
    opts.companies.map((company) =>
      limit(async (): Promise<NormalizedJob[]> => {
        try {
          return await getProvider(company.ats).fetchJobs(company);
        } catch (err) {
          errors.push({ company, message: (err as Error).message });
          return [];
        }
      }),
    ),
  );

  const jobs = perCompany.flat();
  const foundAt = new Date().toISOString();
  const newMatches: MatchRecord[] = [];
  const seenThisScan = new Set<string>();
  let matched = 0;

  for (const job of jobs) {
    if (seenThisScan.has(job.key)) continue;
    seenThisScan.add(job.key);
    const result = await opts.matcher.match(job);
    if (!result.matched) continue;
    matched++;
    if (!opts.log.has(job.key)) {
      newMatches.push({ foundAt, scanNo: opts.scanNo, keywords: opts.keywords, hits: result.hits, job });
    }
  }

  newMatches.sort(newestFirst);
  const endedAt = new Date();
  return {
    scanNo: opts.scanNo,
    startedAt,
    endedAt,
    durationMs: endedAt.getTime() - startedAt.getTime(),
    companiesScanned: opts.companies.length,
    jobsSeen: seenThisScan.size,
    matched,
    newMatches,
    errors,
  };
}

/** Most recently published first; jobs without a date go last. */
function newestFirst(a: MatchRecord, b: MatchRecord): number {
  const ta = a.job.publishedAt ?? '';
  const tb = b.job.publishedAt ?? '';
  return tb.localeCompare(ta) || a.job.companyName.localeCompare(b.job.companyName);
}
