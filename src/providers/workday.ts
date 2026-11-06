import { z } from 'zod';
import { fetchJson, HttpError } from '../core/http.js';
import { htmlToPlain } from '../core/text.js';
import { jobKey, type Company, type NormalizedJob } from '../types.js';
import { fetchDetails, searchText, toIso } from './details.js';
import type { AtsProvider, FetchContext, ProbeResult, UrlMatch } from './types.js';

/**
 * Workday career sites (`<tenant>.wd5.myworkdayjobs.com/<site>`), read through the
 * public JSON API the site itself uses. The board token is `tenant/wdN/site`,
 * e.g. `zillow/wd5/Zillow_Group_External`.
 *
 * Boards can hold tens of thousands of jobs and the list has no descriptions, so a
 * scan searches with its keywords (Workday ANDs the words) and fetches at most
 * MAX_POSTINGS details.
 */
const PAGE_SIZE = 20; // Workday rejects larger pages.
const MAX_POSTINGS = 400;

const HOST_RE = /^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/i;
const LOCALE_RE = /^[a-z]{2}(?:-[a-z]{2})?$/i;

const ListSchema = z.object({
  total: z.number().nullish(),
  jobPostings: z.array(
    z.object({
      title: z.string(),
      externalPath: z.string().nullish(),
      locationsText: z.string().nullish(),
    }),
  ),
});

const DetailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string().nullish(),
    jobDescription: z.string().nullish(),
    location: z.string().nullish(),
    additionalLocations: z.array(z.string()).nullish(),
    startDate: z.string().nullish(),
    timeType: z.string().nullish(),
    remoteType: z.string().nullish(),
    externalUrl: z.string().nullish(),
  }),
});
type Detail = z.infer<typeof DetailSchema>['jobPostingInfo'];

interface Board {
  host: string;
  tenant: string;
  site: string;
}

function parseToken(token: string): Board {
  const [tenant, wd, site, ...rest] = token.split('/');
  if (!tenant || !wd || !/^wd\d+$/i.test(wd) || !site || rest.length) {
    throw new Error(`Workday id must look like tenant/wd5/site, or paste a Workday job URL (got "${token}")`);
  }
  return { host: `${tenant}.${wd}.myworkdayjobs.com`, tenant, site };
}

function apiBase(token: string): string {
  const b = parseToken(token);
  return `https://${b.host}/wday/cxs/${encodeURIComponent(b.tenant)}/${encodeURIComponent(b.site)}`;
}

export const workday: AtsProvider = {
  id: 'workday',
  label: 'Workday',

  apiUrl: (token) => `${apiBase(token)}/jobs`,

  parseUrl(url: URL): UrlMatch | null {
    const host = HOST_RE.exec(url.hostname);
    if (!host) return null;
    const [, tenant, wd] = host;
    const parts = url.pathname.split('/').filter(Boolean);
    // API URL: /wday/cxs/<tenant>/<site>/...
    if (parts[0] === 'wday') return parts[3] ? { kind: 'token', token: `${tenant}/${wd}/${parts[3]}` } : null;
    if (parts[0] && LOCALE_RE.test(parts[0])) parts.shift();
    const site = parts[0];
    return site ? { kind: 'token', token: `${tenant}/${wd}/${site}` } : null;
  },

  async fetchJobs(company: Company, ctx?: FetchContext): Promise<NormalizedJob[]> {
    const board = parseToken(company.token);
    const base = apiBase(company.token);
    const query = searchText(ctx?.keywords);

    const postings: Array<z.infer<typeof ListSchema>['jobPostings'][number] & { externalPath: string }> = [];
    let total = Infinity;
    for (let offset = 0; offset < Math.min(total, MAX_POSTINGS); offset += PAGE_SIZE) {
      const page = ListSchema.parse(
        await fetchJson(`${base}/jobs`, { body: { appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: query } }),
      );
      // Workday only reports the total on the first page.
      if (offset === 0) total = page.total ?? 0;
      for (const p of page.jobPostings) if (p.externalPath) postings.push({ ...p, externalPath: p.externalPath });
      if (page.jobPostings.length < PAGE_SIZE) break;
    }

    const withDetails = await fetchDetails(
      company.id,
      postings,
      (p) => p.externalPath,
      async (p) => DetailSchema.parse(await fetchJson(`${base}${p.externalPath}`)).jobPostingInfo,
    );

    return withDetails.map(({ item: p, detail }) => toJob(company, board, p, detail));
  },

  async probe(token: string): Promise<ProbeResult> {
    try {
      ListSchema.parse(await fetchJson(this.apiUrl(token), { body: { appliedFacets: {}, limit: 1, offset: 0, searchText: '' } }));
      return { ok: true, jobIds: [] };
    } catch (err) {
      // Unknown site: 404. Unknown tenant: 422.
      if (err instanceof HttpError && (err.status === 404 || err.status === 422)) return { ok: false, jobIds: [] };
      throw err;
    }
  },
};

function toJob(
  company: Company,
  board: Board,
  p: { title: string; externalPath: string; locationsText?: string | null },
  d: Detail | null,
): NormalizedJob {
  const jobId = p.externalPath.split('/').filter(Boolean).pop() ?? p.externalPath;
  const locations = d
    ? [d.location, ...(d.additionalLocations ?? [])].filter((l): l is string => !!l)
    : p.locationsText
      ? [p.locationsText]
      : [];
  return {
    key: jobKey(company, jobId),
    jobId,
    ats: 'workday',
    companyId: company.id,
    companyName: company.name,
    title: (d?.title ?? p.title).trim(),
    url: d?.externalUrl ?? `https://${board.host}/${board.site}${p.externalPath}`,
    locations,
    workplaceType: d?.remoteType ?? null,
    department: null,
    employmentType: d?.timeType ?? null,
    publishedAt: toIso(d?.startDate),
    updatedAt: null,
    salary: null,
    description: htmlToPlain(d?.jobDescription),
  };
}
