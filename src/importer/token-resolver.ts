import { getProvider } from '../providers/registry.js';
import type { AtsId } from '../types.js';

/** Labels that never identify a company in a career-site hostname. */
const GENERIC_HOST_LABELS = new Set([
  'www', 'careers', 'career', 'jobs', 'job', 'apply', 'explore', 'work', 'join', 'about',
  'com', 'co', 'io', 'app', 'ai', 'org', 'net', 'health', 'us', 'uk',
]);

/**
 * Guesses board tokens for a company whose career site hides the ATS, e.g.
 * "Clear Street" + careers.clearstreet.io -> clearstreet, clear-street, clear_street.
 */
export function candidateTokens(companyName: string, hosts: string[]): string[] {
  const out = new Set<string>();
  const words = companyName
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length) {
    out.add(words.join(''));
    out.add(words.join('-'));
    out.add(words.join('_'));
  }
  for (const host of hosts) {
    for (const label of host.toLowerCase().split('.')) {
      if (label.length > 1 && !GENERIC_HOST_LABELS.has(label)) out.add(label);
    }
  }
  return [...out];
}

export interface ResolveResult {
  token: string | null;
  tried: string[];
  /** True when one of the known job ids was found on the board (strong evidence). */
  verified: boolean;
}

/**
 * Tries candidate tokens against the ATS API. Prefers a board that contains one of
 * the job ids from the source URLs; otherwise accepts the first live board.
 */
export async function resolveToken(
  ats: AtsId,
  candidates: string[],
  knownJobIds: string[],
): Promise<ResolveResult> {
  const provider = getProvider(ats);
  const tried: string[] = [];
  let firstLive: string | null = null;
  for (const token of candidates) {
    tried.push(token);
    const res = await provider.probe(token);
    if (!res.ok) continue;
    if (knownJobIds.some((id) => res.jobIds.includes(id))) return { token, tried, verified: true };
    firstLive ??= token;
  }
  return { token: firstLive, tried, verified: false };
}
