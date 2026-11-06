import { z } from 'zod';
import { fetchJson, HttpError } from '../core/http.js';
import { htmlToPlain } from '../core/text.js';
import { jobKey, type Company, type NormalizedJob } from '../types.js';
import { epochToIso, fetchDetails, searchText } from './details.js';
import type { AtsProvider, FetchContext, ProbeResult, UrlMatch } from './types.js';

/**
 * Eightfold career sites (e.g. explore.jobs.netflix.net), read through the JSON API
 * the site uses. The token is `host/domain`, e.g. `explore.jobs.netflix.net/netflix.com`.
 *
 * Pages are fixed at 10 jobs and the list has no descriptions, so a scan searches
 * with its keywords first and fetches at most MAX_POSITIONS details.
 * Some companies on Eightfold (Microsoft, Autodesk) block API access; the URL
 * detector lists them as unsupported.
 */
const PAGE_SIZE = 10;
const MAX_POSITIONS = 300;
/** Eightfold answers 429 quickly, so fetch descriptions two at a time. */
const DETAIL_CONCURRENCY = 2;

const PositionSchema = z.object({
  id: z.number(),
  name: z.string(),
  location: z.string().nullish(),
  locations: z.array(z.string()).nullish(),
  department: z.string().nullish(),
  t_create: z.number().nullish(),
  t_update: z.number().nullish(),
  work_location_option: z.string().nullish(),
  canonicalPositionUrl: z.string().nullish(),
});
type Position = z.infer<typeof PositionSchema>;

const ListSchema = z.object({ count: z.number().nullish(), positions: z.array(PositionSchema) });
const DetailSchema = z.object({ job_description: z.string().nullish() });

interface Site {
  host: string;
  domain: string;
}

function parseToken(token: string): Site {
  const [host, domain, ...rest] = token.split('/');
  if (!host || !domain || rest.length) {
    throw new Error(`Eightfold id must look like host/domain, or paste an Eightfold job URL (got "${token}")`);
  }
  return { host, domain };
}

function listUrl(site: Site, start: number, query: string): string {
  const q = new URLSearchParams({ domain: site.domain, start: String(start), num: String(PAGE_SIZE) });
  if (query) q.set('query', query);
  return `https://${site.host}/api/apply/v2/jobs?${q}`;
}

export const eightfold: AtsProvider = {
  id: 'eightfold',
  label: 'Eightfold',

  apiUrl: (token) => listUrl(parseToken(token), 0, ''),

  parseUrl(url: URL): UrlMatch | null {
    const domain = url.searchParams.get('domain');
    const isJobPage = /^\/careers(\/|$)/.test(url.pathname) || url.pathname.startsWith('/api/apply/');
    return domain && isJobPage ? { kind: 'token', token: `${url.hostname}/${domain}` } : null;
  },

  async fetchJobs(company: Company, ctx?: FetchContext): Promise<NormalizedJob[]> {
    const site = parseToken(company.token);
    const query = searchText(ctx?.keywords);

    const positions: Position[] = [];
    let count = Infinity;
    for (let start = 0; start < Math.min(count, MAX_POSITIONS); start += PAGE_SIZE) {
      const page = ListSchema.parse(await fetchJson(listUrl(site, start, query)));
      count = page.count ?? 0;
      positions.push(...page.positions);
      if (page.positions.length < PAGE_SIZE) break;
    }

    const withDetails = await fetchDetails(
      company.id,
      positions,
      (p) => String(p.id),
      async (p) =>
        DetailSchema.parse(
          await fetchJson(`https://${site.host}/api/apply/v2/jobs/${p.id}?domain=${encodeURIComponent(site.domain)}`),
        ),
      DETAIL_CONCURRENCY,
    );

    return withDetails.map(({ item: p, detail }) => {
      const jobId = String(p.id);
      return {
        key: jobKey(company, jobId),
        jobId,
        ats: 'eightfold' as const,
        companyId: company.id,
        companyName: company.name,
        title: p.name.trim(),
        url: p.canonicalPositionUrl ?? `https://${site.host}/careers/job/${jobId}`,
        locations: p.locations?.length ? p.locations : p.location ? [p.location] : [],
        workplaceType: p.work_location_option ?? null,
        department: p.department ?? null,
        employmentType: null,
        publishedAt: epochToIso(p.t_create),
        updatedAt: epochToIso(p.t_update),
        salary: null,
        description: htmlToPlain(detail?.job_description),
      };
    });
  },

  async probe(token: string): Promise<ProbeResult> {
    try {
      const page = ListSchema.parse(await fetchJson(this.apiUrl(token)));
      return { ok: true, jobIds: page.positions.map((p) => String(p.id)) };
    } catch (err) {
      if (err instanceof HttpError && (err.status === 404 || err.status === 403)) return { ok: false, jobIds: [] };
      throw err;
    }
  },
};
