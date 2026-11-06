import type { NormalizedJob } from '../types.js';
import type { KeywordHit, MatchField, Matcher, MatchResult } from './types.js';

/** Split "frontend, remote , React" into ["frontend", "remote", "React"] (deduped, case-insensitive). */
export function parseKeywords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const kw = raw.trim().replace(/\s+/g, ' ');
    if (!kw || seen.has(kw.toLowerCase())) continue;
    seen.add(kw.toLowerCase());
    out.push(kw);
  }
  return out;
}

/**
 * Case-insensitive whole-word regex. "react" does not match "reactive"; "c++" and
 * "node.js" work because boundaries are "not a letter/digit" rather than `\b`.
 * Inner whitespace matches any whitespace run, so "design systems" spans line breaks.
 */
export function keywordRegex(keyword: string): RegExp {
  const body = keyword
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu');
}

function fieldsOf(job: NormalizedJob): Array<[MatchField, string]> {
  return [
    ['title', job.title],
    ['location', [...job.locations, job.workplaceType ?? ''].join(' | ')],
    ['department', job.department ?? ''],
    ['description', job.description],
  ];
}

/** Every keyword must appear (AND) in at least one field: title, location, department or description. */
export class KeywordMatcher implements Matcher {
  readonly name = 'keyword';
  private readonly patterns: Array<{ keyword: string; re: RegExp }>;

  constructor(readonly keywords: string[]) {
    if (keywords.length === 0) throw new Error('KeywordMatcher needs at least one keyword');
    this.patterns = keywords.map((keyword) => ({ keyword, re: keywordRegex(keyword) }));
  }

  async match(job: NormalizedJob): Promise<MatchResult> {
    return this.matchSync(job);
  }

  matchSync(job: NormalizedJob): MatchResult {
    const fields = fieldsOf(job);
    const hits: KeywordHit[] = [];
    for (const { keyword, re } of this.patterns) {
      const where = fields.filter(([, text]) => re.test(text)).map(([f]) => f);
      if (where.length === 0) return { matched: false, hits: [] };
      hits.push({ keyword, fields: where });
    }
    return { matched: true, hits };
  }
}
