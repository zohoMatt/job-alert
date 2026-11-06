import type { AtsId, Company, NormalizedJob } from '../types.js';

/**
 * What a provider can read from a URL:
 * - `token`: the URL is on this ATS's own job board, so the company token is in it.
 * - `probe`: the URL is on the company's own site but carries this ATS's job id
 *   (e.g. `?gh_jid=`), so the token has to be guessed and checked against the API.
 */
export type UrlMatch = { kind: 'token'; token: string } | { kind: 'probe'; jobId: string };

export interface ProbeResult {
  ok: boolean;
  jobIds: string[];
}

/**
 * One ATS platform. To support a new platform, implement this and add it to the registry.
 */
export interface AtsProvider {
  readonly id: AtsId;
  readonly label: string;
  apiUrl(token: string): string;
  parseUrl(url: URL): UrlMatch | null;
  fetchJobs(company: Company): Promise<NormalizedJob[]>;
  /** Checks whether `token` is a live board. Returns ok=false on 404. */
  probe(token: string): Promise<ProbeResult>;
}
