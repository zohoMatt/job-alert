import pLimit from 'p-limit';
import { createCompany, getProvider } from '../providers/registry.js';
import { companyId, type AtsId, type Company } from '../types.js';

export type ManualAddResult =
  | { status: 'added'; input: string; company: Company }
  | { status: 'known'; input: string; company: Company }
  | { status: 'not-found'; input: string; token: string }
  | { status: 'invalid'; input: string; message: string }
  | { status: 'error'; input: string; token: string; message: string };

/** A board id. Workday ids have slash-separated parts (tenant/wd5/site). */
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._-]+)*$/;

/** "figma, stripe ,,Figma" -> ["figma", "stripe"] (deduped, case-insensitive). */
export function parseTokenList(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

/**
 * Accepts a board token ("figma") or a board URL on that platform
 * ("https://job-boards.greenhouse.io/figma/jobs/123") and returns the token.
 */
export function tokenFromInput(ats: AtsId, input: string): { token: string } | { error: string } {
  if (TOKEN_RE.test(input) && !input.includes('.')) return { token: input };
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const m = getProvider(ats).parseUrl(url);
    if (m?.kind === 'token') return { token: m.token };
  } catch {
    // fall through
  }
  return { error: `not a ${getProvider(ats).label} board id or board URL` };
}

/**
 * Checks each id against the platform API. Ids already in `known` are returned as
 * `known` without a request. Nothing is saved here.
 */
export async function addManualCompanies(ats: AtsId, input: string, known: Company[]): Promise<ManualAddResult[]> {
  const provider = getProvider(ats);
  const limit = pLimit(4);
  return Promise.all(
    parseTokenList(input).map((raw) =>
      limit(async (): Promise<ManualAddResult> => {
        const parsed = tokenFromInput(ats, raw);
        if ('error' in parsed) return { status: 'invalid', input: raw, message: parsed.error };
        const { token } = parsed;

        const existing = known.find((c) => c.id === companyId(ats, token));
        if (existing) return { status: 'known', input: raw, company: existing };

        try {
          const res = await provider.probe(token);
          if (!res.ok) return { status: 'not-found', input: raw, token };
          const company = createCompany({ ats, token, name: token, source: 'manual', resolvedBy: 'manual' });
          return { status: 'added', input: raw, company };
        } catch (err) {
          return { status: 'error', input: raw, token, message: (err as Error).message };
        }
      }),
    ),
  );
}
