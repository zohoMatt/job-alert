import { describe, expect, it } from 'vitest';
import { parseTokenList, tokenFromInput } from '../src/companies/add-manual.js';

describe('parseTokenList', () => {
  it('splits on commas, trims and dedupes case-insensitively', () => {
    expect(parseTokenList(' figma, stripe ,,Figma ')).toEqual(['figma', 'stripe']);
  });
});

describe('tokenFromInput', () => {
  it('accepts a bare id', () => {
    expect(tokenFromInput('greenhouse', 'figma')).toEqual({ token: 'figma' });
    expect(tokenFromInput('ashby', 'hims-and-hers')).toEqual({ token: 'hims-and-hers' });
  });
  it('accepts a board URL on the same platform', () => {
    expect(tokenFromInput('greenhouse', 'https://job-boards.greenhouse.io/figma/jobs/1')).toEqual({ token: 'figma' });
    expect(tokenFromInput('ashby', 'jobs.ashbyhq.com/linear')).toEqual({ token: 'linear' });
    expect(tokenFromInput('lever', 'https://jobs.lever.co/iheartjane/abc')).toEqual({ token: 'iheartjane' });
  });
  it('rejects URLs from another platform or junk', () => {
    expect(tokenFromInput('lever', 'https://jobs.ashbyhq.com/linear')).toHaveProperty('error');
    expect(tokenFromInput('greenhouse', 'careers.airbnb.com')).toHaveProperty('error');
    expect(tokenFromInput('ashby', 'two words')).toHaveProperty('error');
  });
});
