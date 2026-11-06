import { z } from 'zod';
import { fetchJson, HttpError } from '../core/http.js';
import { htmlToPlain, joinNonEmpty } from '../core/text.js';
import { jobKey, type Company, type NormalizedJob } from '../types.js';
import type { AtsProvider, ProbeResult, UrlMatch } from './types.js';

const PostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  workplaceType: z.string().nullish(),
  categories: z
    .object({
      commitment: z.string().nullish(),
      location: z.string().nullish(),
      team: z.string().nullish(),
      department: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  descriptionPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  additionalPlain: z.string().nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});

const ResponseSchema = z.array(PostingSchema);

export const lever: AtsProvider = {
  id: 'lever',
  label: 'Lever',

  apiUrl: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,

  parseUrl(url: URL): UrlMatch | null {
    if (url.hostname !== 'jobs.lever.co') return null;
    const [token] = url.pathname.split('/').filter(Boolean);
    return token ? { kind: 'token', token } : null;
  },

  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    const postings = ResponseSchema.parse(await fetchJson(company.api));
    return postings.map((p) => {
      const c = p.categories;
      const locations = c?.allLocations?.length ? c.allLocations : c?.location ? [c.location] : [];
      return {
        key: jobKey(company, p.id),
        jobId: p.id,
        ats: 'lever',
        companyId: company.id,
        companyName: company.name,
        title: p.text.trim(),
        url: p.hostedUrl ?? null,
        locations,
        workplaceType: p.workplaceType ?? null,
        department: joinNonEmpty([c?.department, c?.team], ' / ') || null,
        employmentType: c?.commitment ?? null,
        publishedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        updatedAt: null,
        salary: formatSalary(p.salaryRange),
        description: joinNonEmpty([
          p.descriptionPlain,
          ...(p.lists ?? []).map((l) => joinNonEmpty([l.text, htmlToPlain(l.content)], '\n')),
          p.additionalPlain,
        ]),
      };
    });
  },

  async probe(token: string): Promise<ProbeResult> {
    try {
      const postings = ResponseSchema.parse(await fetchJson(this.apiUrl(token)));
      return { ok: true, jobIds: postings.map((p) => p.id) };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { ok: false, jobIds: [] };
      throw err;
    }
  },
};

function formatSalary(r: z.infer<typeof PostingSchema>['salaryRange']): string | null {
  if (!r || (r.min == null && r.max == null)) return null;
  const fmt = (n: number | null | undefined) => (n == null ? '?' : n.toLocaleString('en-US'));
  const interval = r.interval ? ` (${r.interval.replace(/-/g, ' ')})` : '';
  return `${r.currency ?? ''} ${fmt(r.min)} – ${fmt(r.max)}${interval}`.trim();
}
