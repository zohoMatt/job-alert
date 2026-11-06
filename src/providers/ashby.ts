import { z } from 'zod';
import { fetchJson, HttpError } from '../core/http.js';
import { htmlToPlain } from '../core/text.js';
import { jobKey, type Company, type NormalizedJob } from '../types.js';
import type { AtsProvider, ProbeResult, UrlMatch } from './types.js';

const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string().nullish(),
  team: z.string().nullish(),
  employmentType: z.string().nullish(),
  location: z.string().nullish(),
  secondaryLocations: z.array(z.object({ location: z.string().nullish() })).nullish(),
  publishedAt: z.string().nullish(),
  isListed: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  jobUrl: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  compensation: z
    .object({
      compensationTierSummary: z.string().nullish(),
      scrapeableCompensationSalarySummary: z.string().nullish(),
    })
    .nullish(),
});

const ResponseSchema = z.object({ jobs: z.array(JobSchema) });

export const ashby: AtsProvider = {
  id: 'ashby',
  label: 'Ashby',

  apiUrl: (token) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`,

  parseUrl(url: URL): UrlMatch | null {
    if (url.hostname === 'jobs.ashbyhq.com') {
      const [token] = url.pathname.split('/').filter(Boolean);
      return token ? { kind: 'token', token } : null;
    }
    // Company career site backed by Ashby, e.g. linear.app/careers/...?ashby_jid=<uuid>
    const jobId = url.searchParams.get('ashby_jid');
    return jobId ? { kind: 'probe', jobId } : null;
  },

  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    const raw = await fetchJson(`${company.api}?includeCompensation=true`);
    const { jobs } = ResponseSchema.parse(raw);
    return jobs
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        key: jobKey(company, j.id),
        jobId: j.id,
        ats: 'ashby' as const,
        companyId: company.id,
        companyName: company.name,
        title: j.title.trim(),
        url: j.jobUrl ?? null,
        locations: [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(
          (l): l is string => !!l,
        ),
        workplaceType: j.workplaceType ?? null,
        department: [j.department, j.team].filter(Boolean).join(' / ') || null,
        employmentType: j.employmentType ?? null,
        publishedAt: j.publishedAt ? new Date(j.publishedAt).toISOString() : null,
        updatedAt: null,
        salary:
          j.compensation?.scrapeableCompensationSalarySummary ??
          j.compensation?.compensationTierSummary ??
          null,
        description: j.descriptionPlain?.trim() || htmlToPlain(j.descriptionHtml),
      }));
  },

  async probe(token: string): Promise<ProbeResult> {
    try {
      const { jobs } = ResponseSchema.parse(await fetchJson(this.apiUrl(token)));
      return { ok: true, jobIds: jobs.map((j) => j.id) };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { ok: false, jobIds: [] };
      throw err;
    }
  },
};
