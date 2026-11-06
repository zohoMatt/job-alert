import { describe, expect, it } from 'vitest';
import { parseNotionCsv } from '../src/importer/notion-csv.js';
import { candidateTokens } from '../src/importer/token-resolver.js';
import { detectUrl } from '../src/importer/url-detector.js';

describe('detectUrl', () => {
  const pick = (u: string) => {
    const d = detectUrl(u);
    if (d.kind === 'token') return `${d.ats}:token:${d.token}`;
    if (d.kind === 'probe') return `${d.ats}:probe:${d.jobId}`;
    if (d.kind === 'unsupported') return `unsupported:${d.platform}`;
    return 'none';
  };

  it.each([
    ['https://job-boards.greenhouse.io/reddit/jobs/7751064', 'greenhouse:token:reddit'],
    ['https://boards.greenhouse.io/figma/jobs/1?gh_jid=1', 'greenhouse:token:figma'],
    ['https://job-boards.greenhouse.io/embed/job_app?token=8088201&for=coinbase', 'greenhouse:token:coinbase'],
    ['https://careers.airbnb.com/positions/8077451/?gh_jid=8077451&gh_src=x', 'greenhouse:probe:8077451'],
    ['https://my.greenhouse.io/applications/94041207', 'unsupported:Greenhouse applicant portal (not a job board)'],
    ['https://jobs.ashbyhq.com/clickup/dce7700d?departmentId=x', 'ashby:token:clickup'],
    ['https://linear.app/careers/b4a7?ashby_jid=b4a7', 'ashby:probe:b4a7'],
    ['https://jobs.lever.co/iheartjane/440b0596', 'lever:token:iheartjane'],
    ['https://zillow.wd5.myworkdayjobs.com/en-US/x', 'unsupported:Workday'],
    ['https://www.linkedin.com/jobs/view/4434897576/', 'unsupported:LinkedIn'],
    ['https://www.shopify.com/careers/x', 'unsupported:unknown (shopify.com)'],
    ['', 'none'],
  ])('%s', (url, expected) => {
    expect(pick(url)).toBe(expected);
  });
});

describe('candidateTokens', () => {
  it('derives tokens from the name and the career-site host', () => {
    expect(candidateTokens('Clear Street', ['careers.clearstreet.io'])).toEqual(['clearstreet', 'clear-street', 'clear_street']);
    expect(candidateTokens('AirBnb', ['careers.airbnb.com'])).toEqual(['airbnb']);
    expect(candidateTokens('HOKA (Deckers)', ['www.hoka.com'])).toEqual(['hoka']);
  });
});

describe('parseNotionCsv', () => {
  it('reads name and URL columns, handles BOM and quoted commas', () => {
    const csv = String.fromCharCode(0xfeff) + 'Company name,Job title,URL\nReddit,"Senior Frontend, Home",https://job-boards.greenhouse.io/reddit/jobs/1\n,,\n';
    expect(parseNotionCsv(csv)).toEqual([
      { line: 2, companyName: 'Reddit', url: 'https://job-boards.greenhouse.io/reddit/jobs/1' },
      { line: 3, companyName: '', url: '' },
    ]);
  });
});
