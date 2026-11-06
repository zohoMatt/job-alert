import type { KeywordHit } from '../matching/types.js';
import type { NormalizedJob } from '../types.js';

export interface MatchedJob {
  job: NormalizedJob;
  hits: KeywordHit[];
}

/** "Senior / Staff  Software Engineer " -> "senior / staff software engineer" */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Key of a role: company + normalized title. Postings of one role share it. */
export function roleKey(job: NormalizedJob): string {
  return `${job.companyId}:title:${normalizeTitle(job.title)}`;
}

/**
 * Companies often post one role several times, once per location (e.g. "Remote US"
 * and "Remote Canada", same requisition). Merges matched postings with the same
 * company and title into one job:
 * - key: the role key; `postings` lists every original posting
 * - locations: union, in order; publishedAt/updatedAt: the latest
 * - url/description: from the most recently published posting
 * - hits: per keyword, the union of the fields it was found in
 * A role with a single posting is returned unchanged.
 */
export function mergePostings(matches: MatchedJob[]): MatchedJob[] {
  const groups = new Map<string, MatchedJob[]>();
  for (const m of matches) {
    const key = roleKey(m.job);
    const group = groups.get(key);
    if (group) group.push(m);
    else groups.set(key, [m]);
  }
  return [...groups.entries()].map(([key, group]) => (group.length === 1 ? group[0]! : mergeGroup(key, group)));
}

function mergeGroup(key: string, group: MatchedJob[]): MatchedJob {
  const sorted = [...group].sort((a, b) => (b.job.publishedAt ?? '').localeCompare(a.job.publishedAt ?? ''));
  const lead = sorted[0]!.job;

  const locations = unique(sorted.flatMap((m) => m.job.locations));
  const latest = (pick: (j: NormalizedJob) => string | null) =>
    sorted.map((m) => pick(m.job)).filter((v): v is string => !!v).sort().at(-1) ?? null;

  const hitFields = new Map<string, Set<KeywordHit['fields'][number]>>();
  for (const m of sorted) {
    for (const h of m.hits) {
      const fields = hitFields.get(h.keyword) ?? new Set();
      h.fields.forEach((f) => fields.add(f));
      hitFields.set(h.keyword, fields);
    }
  }

  return {
    job: {
      ...lead,
      key,
      locations,
      publishedAt: latest((j) => j.publishedAt),
      updatedAt: latest((j) => j.updatedAt),
      postings: sorted.map((m) => ({
        key: m.job.key,
        jobId: m.job.jobId,
        url: m.job.url,
        locations: m.job.locations,
      })),
    },
    hits: sorted[0]!.hits.map((h) => ({ keyword: h.keyword, fields: [...hitFields.get(h.keyword)!] })),
  };
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const k = v.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Every key that identifies this job in the match log: its own key, its role key
 * (company + title) and its postings' keys. A job counts as already reported when
 * any of them is logged, so a role is reported once even when a posting for another
 * location appears later, and records written before merging existed still count.
 */
export function identityKeys(job: Pick<NormalizedJob, 'key' | 'companyId' | 'title' | 'postings'>): string[] {
  return [...new Set([job.key, roleKey(job as NormalizedJob), ...(job.postings ?? []).map((p) => p.key)])];
}
