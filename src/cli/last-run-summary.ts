import { formatDuration, localDate, localDateTime, localTime } from '../core/time.js';
import type { RunConfig } from '../store/config-store.js';
import type { RunRecord } from '../store/last-run.js';
import type { Company } from '../types.js';

export interface LastRunSummary {
  /** Plain-text lines to print (no colors). */
  lines: string[];
  /** Saved companies that still exist in companies.json. */
  companies: Company[];
  /** Saved company ids that are no longer in companies.json. */
  missingIds: string[];
}

/** Describes the previous run and its settings, for "start with the same settings?". */
export function describeLastRun(record: RunRecord | null, config: RunConfig, known: Company[]): LastRunSummary {
  const byId = new Map(known.map((c) => [c.id, c]));
  const companies = config.companyIds.map((id) => byId.get(id)).filter((c): c is Company => !!c);
  const missingIds = config.companyIds.filter((id) => !byId.has(id));

  const lines: string[] = [];
  if (record) lines.push(`Last run: ${describeRecord(record)}`);
  lines.push(`  Interval : every ${config.intervalMinutes} min`);
  lines.push(`  Companies: ${companies.length} (${companies.map((c) => c.name).join(', ') || 'none'})`);
  if (missingIds.length) {
    lines.push(`             ${missingIds.length} no longer in companies.json: ${missingIds.join(', ')}`);
  }
  lines.push(`  Keywords : ${config.keywords.join(' AND ')}`);
  return { lines, companies, missingIds };
}

function describeRecord(r: RunRecord): string {
  const started = new Date(r.startedAt);
  const scans = `${r.scans} scan${r.scans === 1 ? '' : 's'}, ${r.newMatches} new match${r.newMatches === 1 ? '' : 'es'}`;
  if (r.stoppedAt) {
    const stopped = new Date(r.stoppedAt);
    const end = localDate(stopped) === localDate(started) ? localTime(stopped) : localDateTime(stopped);
    return `${localDateTime(started)} -> ${end} (ran ${formatDuration(stopped.getTime() - started.getTime())}, ${scans})`;
  }
  const last = r.lastScanAt ? `, last scan ${localDateTime(new Date(r.lastScanAt))}` : '';
  return `started ${localDateTime(started)} (${scans}${last}); did not exit cleanly (window closed or crashed)`;
}
