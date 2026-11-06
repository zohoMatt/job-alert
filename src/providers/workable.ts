import { z } from 'zod';
import { fetchJson, HttpError } from '../core/http.js';
import { htmlToPlain, joinNonEmpty } from '../core/text.js';
import { jobKey, type Company, type NormalizedJob } from '../types.js';
import { fetchDetails, toIso } from './details.js';
import type { AtsProvider, ProbeResult, UrlMatch } from './types.js';

/**
 * Workable boards (`apply.workable.com/<account>`), read through the JSON API the
 * board page uses. The list has no descriptions, so each job's detail is fetched
 * once and cached.
 */
const MAX_PAGES = 20;
const NOT_ACCOUNTS = new Set(['api', 'j']);
const NOT_SUBDOMAINS = new Set(['apply', 'www', 'jobs', 'resources', 'help']);

const LocationSchema = z.object({
  city: z.string().nullish(),
  region: z.string().nullish(),
  country: z.string().nullish(),
});

const ListSchema = z.object({
  total: z.number().nullish(),
  nextPage: z.string().nullish(),
  results: z.array(
    z.object({
      shortcode: z.string(),
      title: z.string(),
      remote: z.boolean().nullish(),
      workplace: z.string().nullish(),
      type: z.string().nullish(),
      published: z.string().nullish(),
      department: z.array(z.string()).nullish(),
      location: LocationSchema.nullish(),
      locations: z.array(LocationSchema).nullish(),
    }),
  ),
});
type Listed = z.infer<typeof ListSchema>['results'][number];

const DetailSchema = z.object({
  description: z.string().nullish(),
  requirements: z.string().nullish(),
  benefits: z.string().nullish(),
  salary_from: z.number().nullish(),
  salary_to: z.number().nullish(),
  salary_currency_iso_code: z.string().nullish(),
  salary_frequency: z.string().nullish(),
});
type Detail = z.infer<typeof DetailSchema>;

const listBody = (nextPage?: string) => ({
  query: '',
  location: [],
  department: [],
  worktype: [],
  remote: [],
  ...(nextPage ? { token: nextPage } : {}),
});

export const workable: AtsProvider = {
  id: 'workable',
  label: 'Workable',

  apiUrl: (token) => `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(token)}/jobs`,

  parseUrl(url: URL): UrlMatch | null {
    if (url.hostname === 'apply.workable.com') {
      const [first] = url.pathname.split('/').filter(Boolean);
      return first && !NOT_ACCOUNTS.has(first) ? { kind: 'token', token: first } : null;
    }
    // Older boards: <account>.workable.com
    const sub = /^([a-z0-9-]+)\.workable\.com$/i.exec(url.hostname)?.[1];
    return sub && !NOT_SUBDOMAINS.has(sub.toLowerCase()) ? { kind: 'token', token: sub } : null;
  },

  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    const listed: Listed[] = [];
    let nextPage: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = ListSchema.parse(await fetchJson(company.api, { body: listBody(nextPage) }));
      listed.push(...res.results);
      nextPage = res.nextPage ?? undefined;
      if (!nextPage) break;
    }

    const detailBase = `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(company.token)}/jobs`;
    const withDetails = await fetchDetails(
      company.id,
      listed,
      (j) => j.shortcode,
      async (j) => DetailSchema.parse(await fetchJson(`${detailBase}/${encodeURIComponent(j.shortcode)}`)),
    );
    return withDetails.map(({ item, detail }) => toJob(company, item, detail));
  },

  async probe(token: string): Promise<ProbeResult> {
    try {
      const res = ListSchema.parse(await fetchJson(this.apiUrl(token), { body: listBody() }));
      return { ok: true, jobIds: res.results.map((j) => j.shortcode) };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { ok: false, jobIds: [] };
      throw err;
    }
  },
};

function toJob(company: Company, j: Listed, d: Detail | null): NormalizedJob {
  const locs = j.locations?.length ? j.locations : j.location ? [j.location] : [];
  return {
    key: jobKey(company, j.shortcode),
    jobId: j.shortcode,
    ats: 'workable',
    companyId: company.id,
    companyName: company.name,
    title: j.title.trim(),
    url: `https://apply.workable.com/${company.token}/j/${j.shortcode}/`,
    locations: locs.map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ')).filter(Boolean),
    workplaceType: j.workplace ?? (j.remote ? 'remote' : null),
    department: j.department?.join(' / ') || null,
    employmentType: j.type ?? null,
    publishedAt: toIso(j.published),
    updatedAt: null,
    salary: salary(d),
    description: joinNonEmpty([htmlToPlain(d?.description), htmlToPlain(d?.requirements), htmlToPlain(d?.benefits)]),
  };
}

function salary(d: Detail | null): string | null {
  if (!d?.salary_from && !d?.salary_to) return null;
  const fmt = (n: number | null | undefined) => (n ? n.toLocaleString('en-US') : '?');
  const range = d.salary_from && d.salary_to ? `${fmt(d.salary_from)} - ${fmt(d.salary_to)}` : fmt(d.salary_from ?? d.salary_to);
  return [range, d.salary_currency_iso_code, d.salary_frequency ? `/ ${d.salary_frequency}` : null].filter(Boolean).join(' ');
}
