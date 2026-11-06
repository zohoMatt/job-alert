import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDetailCache } from '../src/providers/details.js';
import { createCompany } from '../src/providers/registry.js';
import { workable } from '../src/providers/workable.js';
import { mockFetch } from './helpers/fetch-mock.js';

const LIST = 'https://apply.workable.com/api/v3/accounts/multimediallc/jobs';
const DETAIL = 'https://apply.workable.com/api/v2/accounts/multimediallc/jobs';

// Trimmed from real responses (2026-11-06).
const job = (shortcode: string, title: string) => ({
  id: 1,
  shortcode,
  title,
  remote: true,
  location: { city: '', country: 'United States', countryCode: 'US', region: null },
  locations: [{ city: '', country: 'United States', countryCode: 'US', hidden: false, region: null }],
  state: 'published',
  published: '2026-07-26T00:00:00.000Z',
  type: 'full',
  department: ['Multi Media, LLC', 'Software Engineering'],
  workplace: 'remote',
});
const detail = {
  description: '<p>About us</p>',
  requirements: '<ul><li>React and TypeScript</li></ul>',
  benefits: '<p>Remote</p>',
  salary_from: 130000,
  salary_to: 165000,
  salary_currency_iso_code: 'USD',
  salary_frequency: 'year',
};

const company = createCompany({ ats: 'workable', token: 'multimediallc', name: 'Multi Media LLC', source: 'notion', resolvedBy: 'url' });

beforeEach(() => clearDetailCache());
afterEach(() => vi.unstubAllGlobals());

describe('workable.parseUrl', () => {
  const token = (u: string) => {
    const m = workable.parseUrl(new URL(u));
    return m?.kind === 'token' ? m.token : null;
  };
  it('reads the account from board and job URLs', () => {
    expect(token('https://apply.workable.com/multimediallc/j/3BF366314B/')).toBe('multimediallc');
    expect(token('https://acme.workable.com/jobs/123')).toBe('acme');
    expect(token('https://apply.workable.com/api/v3/accounts/x/jobs')).toBeNull();
    expect(token('https://www.workable.com/pricing')).toBeNull();
  });
});

describe('workable.fetchJobs', () => {
  it('follows nextPage and fills in each job from its detail', async () => {
    const calls = mockFetch((url, method, body) => {
      if (url === LIST && method === 'POST') {
        const page = (body as { token?: string }).token;
        return page === 'p2'
          ? { json: { total: 2, results: [job('BBB', 'Manual QA Engineer')] } }
          : { json: { total: 2, nextPage: 'p2', results: [job('3BF366314B', 'Senior Frontend Engineer (Performance) ')] } };
      }
      if (url.startsWith(`${DETAIL}/`)) return { json: detail };
      return undefined;
    });

    const jobs = await workable.fetchJobs(company);

    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    expect(jobs.map((j) => j.jobId)).toEqual(['3BF366314B', 'BBB']);
    expect(jobs[0]).toMatchObject({
      key: 'workable:multimediallc:3BF366314B',
      ats: 'workable',
      title: 'Senior Frontend Engineer (Performance)',
      url: 'https://apply.workable.com/multimediallc/j/3BF366314B/',
      locations: ['United States'],
      workplaceType: 'remote',
      department: 'Multi Media, LLC / Software Engineering',
      employmentType: 'full',
      publishedAt: '2026-07-26T00:00:00.000Z',
      salary: '130,000 - 165,000 USD / year',
    });
    expect(jobs[0]!.description).toContain('React and TypeScript');
  });
});

describe('workable.probe', () => {
  it('is ok for a live account and not ok on 404', async () => {
    mockFetch((url) => (url === LIST ? { json: { total: 0, results: [] } } : undefined));
    expect((await workable.probe('multimediallc')).ok).toBe(true);
    expect((await workable.probe('nope')).ok).toBe(false);
  });
});
