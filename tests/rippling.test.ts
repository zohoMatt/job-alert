import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDetailCache } from '../src/providers/details.js';
import { createCompany } from '../src/providers/registry.js';
import { rippling } from '../src/providers/rippling.js';
import { mockFetch } from './helpers/fetch-mock.js';

const API = 'https://api.rippling.com/platform/api/ats/v1/board/cerby/jobs';

// Trimmed from real responses (2026-11-06).
const list = [
  {
    uuid: '4222fa68',
    name: 'Automation Support Engineer (NOC)',
    department: { id: 'Customer Operations', label: 'Customer Operations' },
    url: 'https://ats.rippling.com/cerby/jobs/4222fa68',
    workLocation: { id: 'Remote (Mexico)', label: 'Remote (Mexico)' },
  },
];
const detail = {
  uuid: '4222fa68',
  name: 'Automation Support Engineer (NOC)',
  description: { company: '<p>About Cerby</p>', role: '<p>You will use <b>TypeScript</b>.</p>' },
  workLocations: ['Remote (Mexico)', 'Remote (Colombia)'],
  department: { name: 'Technical Support', base_department: 'Customer Operations' },
  employmentType: { label: 'SALARIED_FT', id: 'Salaried, full-time' },
  createdOn: '2026-10-13T13:14:29.162000-07:00',
  url: 'https://ats.rippling.com/cerby/jobs/4222fa68',
};

const company = createCompany({ ats: 'rippling', token: 'cerby', name: 'Cerby', source: 'notion', resolvedBy: 'url' });

beforeEach(() => clearDetailCache());
afterEach(() => vi.unstubAllGlobals());

describe('rippling.parseUrl', () => {
  const token = (u: string) => {
    const m = rippling.parseUrl(new URL(u));
    return m?.kind === 'token' ? m.token : null;
  };
  it('reads the board slug', () => {
    expect(token('https://ats.rippling.com/limble-solutions/jobs/c8a9?jobSite=LinkedIn')).toBe('limble-solutions');
    expect(token('https://ats.rippling.com/en-GB/cerby/jobs')).toBe('cerby');
    expect(token(API)).toBe('cerby');
    expect(token('https://www.rippling.com/careers')).toBeNull();
  });
});

describe('rippling.fetchJobs', () => {
  it('lists the board and fills in each job from its detail', async () => {
    mockFetch((url) => (url === API ? { json: list } : url === `${API}/4222fa68` ? { json: detail } : undefined));
    const [job] = await rippling.fetchJobs(company);
    expect(job).toMatchObject({
      key: 'rippling:cerby:4222fa68',
      ats: 'rippling',
      title: 'Automation Support Engineer (NOC)',
      url: 'https://ats.rippling.com/cerby/jobs/4222fa68',
      locations: ['Remote (Mexico)', 'Remote (Colombia)'],
      department: 'Technical Support',
      employmentType: 'Salaried, full-time',
      publishedAt: '2026-10-13T20:14:29.162Z',
    });
    expect(job!.description).toMatch(/TypeScript[\s\S]*About Cerby/);
  });
});

describe('rippling.probe', () => {
  it('is ok for a live board and not ok on 404', async () => {
    mockFetch((url) => (url === API ? { json: list } : undefined));
    expect(await rippling.probe('cerby')).toEqual({ ok: true, jobIds: ['4222fa68'] });
    expect((await rippling.probe('nope')).ok).toBe(false);
  });
});
