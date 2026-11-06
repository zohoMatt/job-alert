import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDetailCache } from '../src/providers/details.js';
import { eightfold } from '../src/providers/eightfold.js';
import { createCompany } from '../src/providers/registry.js';
import { mockFetch } from './helpers/fetch-mock.js';

const HOST = 'https://explore.jobs.netflix.net';

// Trimmed from real responses (2026-11-06).
const position = (id: number) => ({
  id,
  name: 'Software Engineer 4 - TV Product UI ',
  location: 'Los Gatos, California',
  locations: ['Los Gatos, California', 'Remote, United States'],
  department: 'Product',
  t_update: 1785369600,
  t_create: 1785369600,
  ats_job_id: 'JR1',
  job_description: '',
  work_location_option: 'onsite',
  canonicalPositionUrl: `${HOST}/careers/job/${id}`,
});

const company = createCompany({
  ats: 'eightfold',
  token: 'explore.jobs.netflix.net/netflix.com',
  name: 'Netflix',
  source: 'notion',
  resolvedBy: 'url',
});

beforeEach(() => clearDetailCache());
afterEach(() => vi.unstubAllGlobals());

describe('eightfold.parseUrl', () => {
  const token = (u: string) => {
    const m = eightfold.parseUrl(new URL(u));
    return m?.kind === 'token' ? m.token : null;
  };
  it('reads host and domain from a job URL', () => {
    expect(token(`${HOST}/careers/job/790317589519?microsite=netflix.com&utm_source=LinkedIn&domain=netflix.com`)).toBe(
      'explore.jobs.netflix.net/netflix.com',
    );
    expect(token(`${HOST}/careers/job/1`)).toBeNull();
    expect(token('https://example.com/blog?domain=netflix.com')).toBeNull();
  });
});

describe('eightfold.fetchJobs', () => {
  it('searches with the keywords, pages by 10 and fills in descriptions', async () => {
    const ids = Array.from({ length: 13 }, (_, i) => 1000 + i);
    const calls = mockFetch((url) => {
      const u = new URL(url);
      if (u.pathname === '/api/apply/v2/jobs') {
        const start = Number(u.searchParams.get('start'));
        return { json: { count: 13, positions: ids.slice(start, start + 10).map(position) } };
      }
      if (u.pathname.startsWith('/api/apply/v2/jobs/')) return { json: { job_description: '<p>React and TypeScript</p>' } };
      return undefined;
    });

    const jobs = await eightfold.fetchJobs(company, { keywords: ['react', 'typescript'] });

    const lists = calls.map((c) => new URL(c.url)).filter((u) => u.pathname === '/api/apply/v2/jobs');
    expect(lists.map((u) => u.searchParams.get('start'))).toEqual(['0', '10']);
    expect(lists[0]!.searchParams.get('query')).toBe('react typescript');
    expect(lists[0]!.searchParams.get('domain')).toBe('netflix.com');
    expect(jobs).toHaveLength(13);
    expect(jobs[0]).toMatchObject({
      key: 'eightfold:explore.jobs.netflix.net/netflix.com:1000',
      ats: 'eightfold',
      title: 'Software Engineer 4 - TV Product UI',
      url: `${HOST}/careers/job/1000`,
      locations: ['Los Gatos, California', 'Remote, United States'],
      workplaceType: 'onsite',
      department: 'Product',
      publishedAt: '2026-07-30T00:00:00.000Z',
      description: 'React and TypeScript',
    });
  });
});

describe('eightfold.probe', () => {
  it('is ok for a live site and not ok on 404 or 403', async () => {
    mockFetch((url) =>
      url.includes('domain=netflix.com') ? { json: { count: 0, positions: [] } } : url.includes('microsoft') ? { status: 403, json: {} } : undefined,
    );
    expect((await eightfold.probe('explore.jobs.netflix.net/netflix.com')).ok).toBe(true);
    expect((await eightfold.probe('explore.jobs.netflix.net/nosuch.com')).ok).toBe(false);
    expect((await eightfold.probe('apply.careers.microsoft.com/microsoft.com')).ok).toBe(false);
  });
});
