import type { NormalizedJob } from '../types.js';

export type MatchField = 'title' | 'location' | 'department' | 'description';

export interface KeywordHit {
  keyword: string;
  fields: MatchField[];
}

export interface MatchResult {
  matched: boolean;
  hits: KeywordHit[];
  /** Free-form explanation, e.g. from an AI matcher later. */
  reason?: string;
  /** Optional 0..1 relevance score, e.g. from an AI matcher later. */
  score?: number;
}

/**
 * Decides whether a job is relevant. It is async so an AI-based matcher can
 * replace the keyword matcher, or run after it to screen keyword hits.
 */
export interface Matcher {
  readonly name: string;
  match(job: NormalizedJob): Promise<MatchResult>;
}
