export const ATS_IDS = ['greenhouse', 'lever', 'ashby', 'workday'] as const;
export type AtsId = (typeof ATS_IDS)[number];

/** A company board we can scan. `id` is `${ats}:${token}` (lower-cased). */
export interface Company {
  id: string;
  name: string;
  ats: AtsId;
  token: string;
  api: string;
  /** Where the entry came from: imported from Notion, or added by the user in the CLI. */
  source: 'notion' | 'manual';
  /**
   * How the token was found: read from a board URL, guessed and confirmed against
   * the API, or typed in by the user (also confirmed against the API).
   */
  resolvedBy: 'url' | 'probe' | 'manual';
  sampleUrls: string[];
}

/** One job posting, normalized across ATS platforms. */
export interface NormalizedJob {
  /** Globally unique: `${ats}:${token}:${jobId}` */
  key: string;
  jobId: string;
  ats: AtsId;
  companyId: string;
  companyName: string;
  title: string;
  url: string | null;
  locations: string[];
  workplaceType: string | null;
  department: string | null;
  employmentType: string | null;
  /** ISO 8601 */
  publishedAt: string | null;
  /** ISO 8601 */
  updatedAt: string | null;
  salary: string | null;
  /** Plain-text job description. */
  description: string;
  /**
   * Set when several postings of the same role (same company and title, usually one
   * per location) were merged into this job. Each keeps its own id, link and location.
   */
  postings?: Posting[];
}

/** One posting of a merged role. */
export interface Posting {
  key: string;
  jobId: string;
  url: string | null;
  locations: string[];
}

export function companyId(ats: AtsId, token: string): string {
  return `${ats}:${token.toLowerCase()}`;
}

export function jobKey(company: Company, jobId: string): string {
  return `${company.id}:${jobId}`;
}
