import { z } from 'zod';
import { fetchJson, HttpError } from '../core/http.js';
import { escapedHtmlToPlain } from '../core/text.js';
import { jobKey, type Company, type NormalizedJob } from '../types.js';
import type { AtsProvider, ProbeResult, UrlMatch } from './types.js';

const BOARD_HOSTS = new Set([
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
]);

const JobSchema = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
  content: z.string().nullish(),
  departments: z.array(z.object({ name: z.string() })).nullish(),
});

const ResponseSchema = z.object({ jobs: z.array(JobSchema) });

export const greenhouse: AtsProvider = {
  id: 'greenhouse',
  label: 'Greenhouse',

  apiUrl: (token) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,

  parseUrl(url: URL): UrlMatch | null {
    if (BOARD_HOSTS.has(url.hostname)) {
      const [first] = url.pathname.split('/').filter(Boolean);
      // Embedded boards: /embed/job_app?for=<token> or /embed/job_board?for=<token>
      if (first === 'embed') {
        const token = url.searchParams.get('for');
        return token ? { kind: 'token', token } : null;
      }
      return first ? { kind: 'token', token: first } : null;
    }
    // Company career site backed by Greenhouse, e.g. careers.airbnb.com/...?gh_jid=123
    const jobId = url.searchParams.get('gh_jid');
    if (jobId && !url.hostname.endsWith('greenhouse.io')) return { kind: 'probe', jobId };
    return null;
  },

  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    // content=true adds the description and departments (about 15x larger, but one request).
    const raw = await fetchJson(`${company.api}?content=true`);
    const { jobs } = ResponseSchema.parse(raw);
    return jobs.map((j) => {
      const jobId = String(j.id);
      return {
        key: jobKey(company, jobId),
        jobId,
        ats: 'greenhouse',
        companyId: company.id,
        companyName: company.name,
        title: j.title.trim(),
        url: j.absolute_url ?? null,
        locations: j.location?.name ? [j.location.name] : [],
        workplaceType: null,
        department: j.departments?.map((d) => d.name).join(', ') || null,
        employmentType: null,
        publishedAt: toIso(j.first_published),
        updatedAt: toIso(j.updated_at),
        salary: null,
        description: escapedHtmlToPlain(j.content),
      };
    });
  },

  async probe(token: string): Promise<ProbeResult> {
    try {
      const { jobs } = ResponseSchema.parse(await fetchJson(this.apiUrl(token)));
      return { ok: true, jobIds: jobs.map((j) => String(j.id)) };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { ok: false, jobIds: [] };
      throw err;
    }
  },
};

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
