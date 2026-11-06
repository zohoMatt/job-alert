import { describe, expect, it } from 'vitest';
import { KeywordMatcher, keywordRegex, parseKeywords } from '../src/matching/keyword-matcher.js';
import type { NormalizedJob } from '../src/types.js';

const job = (over: Partial<NormalizedJob> = {}): NormalizedJob => ({
  key: 'greenhouse:acme:1',
  jobId: '1',
  ats: 'greenhouse',
  companyId: 'greenhouse:acme',
  companyName: 'Acme',
  title: 'Senior Frontend Engineer',
  url: null,
  locations: ['New York, NY'],
  workplaceType: 'Remote',
  department: 'Engineering',
  employmentType: null,
  publishedAt: null,
  updatedAt: null,
  salary: null,
  description: 'You will build UI with React and TypeScript.\nExperience with design\nsystems is a plus. C++ not required.',
  ...over,
});

describe('parseKeywords', () => {
  it('splits, trims and dedupes case-insensitively', () => {
    expect(parseKeywords(' frontend, Remote ,, remote,design   systems ')).toEqual(['frontend', 'Remote', 'design systems']);
  });
});

describe('keywordRegex', () => {
  it('matches whole words only, ignoring case', () => {
    expect(keywordRegex('react').test('We use React.')).toBe(true);
    expect(keywordRegex('react').test('reactive streams')).toBe(false);
    expect(keywordRegex('java').test('JavaScript')).toBe(false);
  });
  it('handles symbols and multi-word phrases', () => {
    expect(keywordRegex('c++').test('C++ developer')).toBe(true);
    expect(keywordRegex('node.js').test('Node.js, Go')).toBe(true);
    expect(keywordRegex('node.js').test('nodexjs')).toBe(false);
    expect(keywordRegex('design systems').test('design\nsystems')).toBe(true);
  });
});

describe('KeywordMatcher', () => {
  it('requires every keyword and reports where each was found', async () => {
    const r = await new KeywordMatcher(['frontend', 'remote', 'react']).match(job());
    expect(r.matched).toBe(true);
    expect(r.hits).toEqual([
      { keyword: 'frontend', fields: ['title'] },
      { keyword: 'remote', fields: ['location'] },
      { keyword: 'react', fields: ['description'] },
    ]);
  });
  it('fails when any keyword is missing', async () => {
    const r = await new KeywordMatcher(['frontend', 'vue']).match(job());
    expect(r).toEqual({ matched: false, hits: [] });
  });
  it('matches location text such as "US, Remote"', async () => {
    const r = await new KeywordMatcher(['us']).match(job({ locations: ['US, Remote'], workplaceType: null, description: '' }));
    expect(r.matched).toBe(true);
  });
});
