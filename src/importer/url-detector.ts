import { providers } from '../providers/registry.js';
import type { AtsId } from '../types.js';

export type Detection =
  | { kind: 'token'; ats: AtsId; token: string; url: URL }
  | { kind: 'probe'; ats: AtsId; jobId: string; url: URL }
  | { kind: 'unsupported'; platform: string }
  | { kind: 'none' };

/** Hosts we recognise but cannot scan (no public job board API, or not a job board). */
const KNOWN_UNSUPPORTED: Array<[suffix: string, platform: string]> = [
  ['icims.com', 'iCIMS'],
  ['linkedin.com', 'LinkedIn'],
  ['jobs.netflix.net', 'Eightfold'],
  ['my.greenhouse.io', 'Greenhouse applicant portal (not a job board)'],
];

export function detectUrl(raw: string): Detection {
  const url = toUrl(raw);
  if (!url) return { kind: 'none' };

  for (const [suffix, platform] of KNOWN_UNSUPPORTED) {
    if (url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)) {
      return { kind: 'unsupported', platform };
    }
  }

  for (const provider of providers) {
    const m = provider.parseUrl(url);
    if (!m) continue;
    return m.kind === 'token'
      ? { kind: 'token', ats: provider.id, token: m.token, url }
      : { kind: 'probe', ats: provider.id, jobId: m.jobId, url };
  }

  return { kind: 'unsupported', platform: `unknown (${url.hostname.replace(/^www\./, '')})` };
}

function toUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}
