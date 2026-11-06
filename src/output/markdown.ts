import { localDate, localTime } from '../core/time.js';
import type { ScanReport } from '../core/events.js';
import type { MatchRecord } from '../store/match-log.js';

/** Marks where scan sections start. New sections are inserted right below it. */
export const ENTRIES_MARKER = '<!-- job-alert: newest scans first -->';

export function dailyHeader(date: Date): string {
  return `# Job Alert · ${localDate(date)}\n\n${ENTRIES_MARKER}\n`;
}

/** Puts `section` at the top of the entries, keeping the file header in place. */
export function prependSection(existing: string | null, section: string, date: Date): string {
  const base = existing && existing.includes(ENTRIES_MARKER) ? existing : dailyHeader(date) + (existing ?? '');
  const idx = base.indexOf(ENTRIES_MARKER) + ENTRIES_MARKER.length;
  return `${base.slice(0, idx)}\n\n${section.trim()}\n${base.slice(idx).replace(/^\n*/, '\n')}`.replace(/\n{3,}/g, '\n\n');
}

export function renderScanSection(report: ScanReport, keywords: string[]): string {
  const n = report.newMatches.length;
  const lines = [
    `## ${localTime(report.startedAt)} · Scan #${report.scanNo} · ${n} new match${n === 1 ? '' : 'es'}`,
    '',
    `Keywords: ${keywords.map((k) => `\`${k}\``).join(' AND ')}`,
    '',
  ];
  for (const m of report.newMatches) lines.push(renderJob(m), '');
  return lines.join('\n');
}

function renderJob(m: MatchRecord): string {
  const j = m.job;
  const location = [j.locations.join('; '), j.workplaceType].filter(Boolean).join(' · ');
  const meta: Array<[string, string | null]> = [
    ['URL', j.url],
    ['Location', location || null],
    ['Department', j.department],
    ['Type', j.employmentType],
    ['Salary', j.salary],
    ['Published', j.publishedAt ? j.publishedAt.slice(0, 10) : null],
    ['Board', `${j.ats} / ${j.companyId.split(':')[1]}`],
    ['Matched', m.hits.map((h) => `\`${h.keyword}\` (${h.fields.join(', ')})`).join(' · ')],
  ];
  const body = j.description.replace(/```/g, "'''");
  const postings =
    j.postings && j.postings.length > 1
      ? [
          `- **Postings (${j.postings.length}):**`,
          ...j.postings.map((p) => `  - ${p.locations.join('; ') || 'Location not listed'}: ${p.url ?? `id ${p.jobId}`}`),
        ]
      : [];
  return [
    `### ${escapeMd(j.companyName)} — ${escapeMd(j.title)}`,
    '',
    ...meta.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`),
    ...postings,
    '',
    '<details><summary>Job description</summary>',
    '',
    '```text',
    body,
    '```',
    '',
    '</details>',
  ].join('\n');
}

function escapeMd(s: string): string {
  return s.replace(/([\\`*_[\]<>])/g, '\\$1');
}
