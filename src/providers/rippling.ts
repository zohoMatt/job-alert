import { z } from 'zod';
import { fetchJson, HttpError } from '../core/http.js';
import { htmlToPlain, joinNonEmpty } from '../core/text.js';
import { jobKey, type Company, type NormalizedJob } from '../types.js';
import { fetchDetails, toIso } from './details.js';
import type { AtsProvider, ProbeResult, UrlMatch } from './types.js';

/**
 * Rippling ATS boards (`ats.rippling.com/<slug>/jobs`). The list has no descriptions,
 * so each job's detail is fetched once and cached. Boards are small, so no search.
 */
const LOCALE_RE = /^[a-z]{2}(?:-[a-z]{2})?$/i;

const ListSchema = z.array(
  z.object({
    uuid: z.string(),
    name: z.string(),
    url: z.string().nullish(),
    department: z.object({ label: z.string().nullish() }).nullish(),
    workLocation: z.object({ label: z.string().nullish() }).nullish(),
  }),
);
type Listed = z.infer<typeof ListSchema>[number];

const DetailSchema = z.object({
  name: z.string().nullish(),
  description: z.object({ company: z.string().nullish(), role: z.string().nullish() }).nullish(),
  workLocations: z.array(z.string()).nullish(),
  department: z.object({ name: z.string().nullish() }).nullish(),
  employmentType: z.object({ id: z.string().nullish() }).nullish(),
  createdOn: z.string().nullish(),
  url: z.string().nullish(),
});
type Detail = z.infer<typeof DetailSchema>;

export const rippling: AtsProvider = {
  id: 'rippling',
  label: 'Rippling',

  apiUrl: (token) => `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(token)}/jobs`,

  parseUrl(url: URL): UrlMatch | null {
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'ats.rippling.com') {
      if (parts[0] && LOCALE_RE.test(parts[0]) && parts[1]) parts.shift();
      return parts[0] ? { kind: 'token', token: parts[0] } : null;
    }
    // API URL: /platform/api/ats/v1/board/<slug>/jobs
    if (url.hostname === 'api.rippling.com') {
      const i = parts.indexOf('board');
      return i >= 0 && parts[i + 1] ? { kind: 'token', token: parts[i + 1]! } : null;
    }
    return null;
  },

  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    const listed = ListSchema.parse(await fetchJson(company.api));
    const withDetails = await fetchDetails(
      company.id,
      listed,
      (j) => j.uuid,
      async (j) => DetailSchema.parse(await fetchJson(`${company.api}/${encodeURIComponent(j.uuid)}`)),
    );
    return withDetails.map(({ item, detail }) => toJob(company, item, detail));
  },

  async probe(token: string): Promise<ProbeResult> {
    try {
      const jobs = ListSchema.parse(await fetchJson(this.apiUrl(token)));
      return { ok: true, jobIds: jobs.map((j) => j.uuid) };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { ok: false, jobIds: [] };
      throw err;
    }
  },
};

function toJob(company: Company, j: Listed, d: Detail | null): NormalizedJob {
  const locations = d?.workLocations?.length
    ? d.workLocations
    : j.workLocation?.label
      ? [j.workLocation.label]
      : [];
  return {
    key: jobKey(company, j.uuid),
    jobId: j.uuid,
    ats: 'rippling',
    companyId: company.id,
    companyName: company.name,
    title: (d?.name ?? j.name).trim(),
    url: d?.url ?? j.url ?? `https://ats.rippling.com/${company.token}/jobs/${j.uuid}`,
    locations,
    workplaceType: null,
    department: d?.department?.name ?? j.department?.label ?? null,
    employmentType: d?.employmentType?.id ?? null,
    publishedAt: toIso(d?.createdOn),
    updatedAt: null,
    salary: null,
    description: joinNonEmpty([htmlToPlain(d?.description?.role), htmlToPlain(d?.description?.company)]),
  };
}
