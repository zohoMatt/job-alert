import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDetailCache } from '../src/providers/details.js';
import { createCompany } from '../src/providers/registry.js';
import { workday } from '../src/providers/workday.js';
import { mockFetch } from './helpers/fetch-mock.js';

const BASE = 'https://zillow.wd5.myworkdayjobs.com/wday/cxs/zillow/Zillow_Group_External';

// Trimmed from real responses (2026-11-06).
const listPage = (paths: string[], total: number) => ({
  total,
  jobPostings: paths.map((p, i) => ({
    title: `Job ${i}`,
    externalPath: p,
    locationsText: 'Remote-USA',
    postedOn: 'Posted Today',
    bulletFields: ['P1'],
  })),
});

const detail = {
  jobPostingInfo: {
    id: 'abc',
    title: 'Senior Software Development Engineer ',
    jobDescription: '<p>Build things with <b>React</b> and TypeScript.</p>',
    location: 'Remote-USA',
    additionalLocations: ['Seattle, WA'],
    startDate: '2026-11-06',
    timeType: 'Full time',
    remoteType: 'Remote',
    externalUrl: 'https://zillow.wd5.myworkdayjobs.com/Zillow_Group_External/job/Remote-USA/Senior-SDE_P748924-1',
  },
};

const company = createCompany({
  ats: 'workday',
  token: 'zillow/wd5/Zillow_Group_External',
  name: 'Zillow',
  source: 'notion',
  resolvedBy: 'url',
});

beforeEach(() => clearDetailCache());
afterEach(() => vi.unstubAllGlobals());

describe('workday.parseUrl', () => {
  const token = (u: string) => {
    const m = workday.parseUrl(new URL(u));
    return m?.kind === 'token' ? m.token : null;
  };
  it('reads tenant, data center and site from job and board URLs', () => {
    expect(token('https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/X_JR343623')).toBe(
      'salesforce/wd12/External_Career_Site',
    );
    expect(token('https://amgen.wd1.myworkdayjobs.com/Careers')).toBe('amgen/wd1/Careers');
    expect(token(`${BASE}/jobs`)).toBe('zillow/wd5/Zillow_Group_External');
  });
  it('ignores other hosts and bare hosts', () => {
    expect(token('https://zillow.wd5.myworkdayjobs.com/')).toBeNull();
    expect(token('https://jobs.lever.co/zillow')).toBeNull();
  });
});

describe('workday.apiUrl', () => {
  it('rejects a token without three parts', () => {
    expect(() => workday.apiUrl('zillow')).toThrow(/tenant\/wd5\/site/);
  });
});

describe('workday.fetchJobs', () => {
  it('searches with the keywords, pages through results and fetches details', async () => {
    const paths = Array.from({ length: 25 }, (_, i) => `/job/Remote-USA/Job-${i}_P${i}`);
    const calls = mockFetch((url, method, body) => {
      if (method === 'POST' && url === `${BASE}/jobs`) {
        const { offset } = body as { offset: number };
        return { json: listPage(paths.slice(offset, offset + 20), offset === 0 ? 25 : 0) };
      }
      if (url.startsWith(`${BASE}/job/`)) return { json: detail };
      return undefined;
    });

    const jobs = await workday.fetchJobs(company, { keywords: ['react', 'design systems'] });

    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => (c.body as { offset: number }).offset)).toEqual([0, 20]);
    expect((posts[0]!.body as { searchText: string }).searchText).toBe('react "design systems"');
    expect(jobs).toHaveLength(25);
    expect(jobs[0]).toMatchObject({
      key: 'workday:zillow/wd5/zillow_group_external:Job-0_P0',
      jobId: 'Job-0_P0',
      ats: 'workday',
      companyName: 'Zillow',
      title: 'Senior Software Development Engineer',
      url: detail.jobPostingInfo.externalUrl,
      locations: ['Remote-USA', 'Seattle, WA'],
      workplaceType: 'Remote',
      employmentType: 'Full time',
      publishedAt: '2026-11-06T00:00:00.000Z',
    });
    expect(jobs[0]!.description).toContain('React and TypeScript');
  });

  it('only fetches details for jobs it has not seen', async () => {
    let detailCalls = 0;
    let paths = ['/job/a/A_1', '/job/b/B_2'];
    mockFetch((url, method) => {
      if (method === 'POST') return { json: listPage(paths, paths.length) };
      detailCalls++;
      return { json: detail };
    });
    await workday.fetchJobs(company, { keywords: [] });
    expect(detailCalls).toBe(2);
    paths = ['/job/b/B_2', '/job/c/C_3'];
    await workday.fetchJobs(company, { keywords: [] });
    expect(detailCalls).toBe(3);
  });

  it('keeps a job without a description when its detail request fails', async () => {
    mockFetch((url, method) => (method === 'POST' ? { json: listPage(['/job/a/A_1'], 1) } : { status: 403, json: {} }));
    const [job] = await workday.fetchJobs(company, { keywords: [] });
    expect(job).toMatchObject({
      title: 'Job 0',
      locations: ['Remote-USA'],
      description: '',
      url: 'https://zillow.wd5.myworkdayjobs.com/Zillow_Group_External/job/a/A_1',
    });
  });
});

describe('workday.probe', () => {
  it('is ok for a live site and not ok for 404 or 422', async () => {
    mockFetch((url) => (url === `${BASE}/jobs` ? { json: listPage([], 0) } : url.includes('nosuch') ? { status: 422, json: {} } : undefined));
    expect((await workday.probe('zillow/wd5/Zillow_Group_External')).ok).toBe(true);
    expect((await workday.probe('zillow/wd5/Other')).ok).toBe(false);
    expect((await workday.probe('nosuch/wd5/x')).ok).toBe(false);
  });
});
