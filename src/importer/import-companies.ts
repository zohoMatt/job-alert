import pLimit from 'p-limit';
import { createCompany } from '../providers/registry.js';
import type {
  CompaniesFile,
  UnresolvedCompany,
  UnsupportedCompany,
} from '../store/companies-store.js';
import { companyId, type AtsId, type Company } from '../types.js';
import type { SourceRow } from './notion-csv.js';
import { detectUrl, type Detection } from './url-detector.js';
import { candidateTokens, resolveToken } from './token-resolver.js';

export interface ImportWarning {
  company: string;
  message: string;
}

export interface ImportResult {
  file: CompaniesFile;
  warnings: ImportWarning[];
  skippedRows: number;
}

interface Group {
  name: string;
  rows: Array<{ row: SourceRow; detection: Detection }>;
}

/**
 * Turns Notion rows into a list of scannable company boards.
 * Rows are grouped by company name, so a company applied to many times becomes one entry.
 * Existing `manual` entries from `previous` are kept.
 */
export async function importCompanies(
  rows: SourceRow[],
  opts: { sourceFile: string | null; previous?: CompaniesFile | null; concurrency?: number },
): Promise<ImportResult> {
  const groups = new Map<string, Group>();
  let skippedRows = 0;

  for (const row of rows) {
    const detection = detectUrl(row.url);
    const name = cleanName(row.companyName, detection);
    if (!name) {
      skippedRows++;
      continue;
    }
    const key = normalizeName(name);
    const group = groups.get(key) ?? { name, rows: [] };
    group.rows.push({ row, detection });
    groups.set(key, group);
  }

  const companies = new Map<string, Company>();
  const unresolved: UnresolvedCompany[] = [];
  const unsupported: UnsupportedCompany[] = [];
  const warnings: ImportWarning[] = [];

  const limit = pLimit(opts.concurrency ?? 4);
  await Promise.all(
    [...groups.values()].map((group) =>
      limit(() => resolveGroup(group, companies, unresolved, unsupported, warnings)),
    ),
  );

  const manualNames = new Set<string>();
  for (const c of opts.previous?.companies ?? []) {
    if (c.source !== 'manual') continue;
    manualNames.add(normalizeName(c.name));
    if (!companies.has(c.id)) companies.set(c.id, c);
  }
  // A company added by hand is covered, so it is not reported as unsupported or unresolved.
  const notManual = (x: { name: string }) => !manualNames.has(normalizeName(x.name));

  return {
    file: {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourceFile: opts.sourceFile,
      companies: [...companies.values()],
      unresolved: unresolved.filter(notManual),
      unsupported: unsupported.filter(notManual),
    },
    warnings,
    skippedRows,
  };
}

async function resolveGroup(
  group: Group,
  companies: Map<string, Company>,
  unresolved: UnresolvedCompany[],
  unsupported: UnsupportedCompany[],
  warnings: ImportWarning[],
): Promise<void> {
  const resolvedAts = new Set<AtsId>();
  const add = (ats: AtsId, token: string, url: string, resolvedBy: Company['resolvedBy']) => {
    const id = companyId(ats, token);
    resolvedAts.add(ats);
    const existing = companies.get(id);
    if (existing) {
      if (!existing.sampleUrls.includes(url) && existing.sampleUrls.length < 3) existing.sampleUrls.push(url);
      return;
    }
    companies.set(id, createCompany({ ats, token, name: group.name, source: 'notion', resolvedBy, sampleUrls: [url] }));
  };

  // 1. Tokens read straight from board URLs.
  for (const { detection } of group.rows) {
    if (detection.kind === 'token') add(detection.ats, detection.token, detection.url.href, 'url');
  }

  // 2. Career sites that hide the board token: guess and probe, once per ATS.
  const probes = group.rows.flatMap(({ detection }) => (detection.kind === 'probe' ? [detection] : []));
  for (const ats of new Set(probes.map((p) => p.ats))) {
    if (resolvedAts.has(ats)) continue;
    const mine = probes.filter((p) => p.ats === ats);
    const candidates = candidateTokens(group.name, mine.map((p) => p.url.hostname));
    try {
      const res = await resolveToken(ats, candidates, mine.map((p) => p.jobId));
      if (res.token) {
        add(ats, res.token, mine[0]!.url.href, 'probe');
        if (!res.verified) {
          warnings.push({
            company: group.name,
            message: `${ats} token "${res.token}" is a live board, but none of the job ids from your URLs are on it. Check it is the right company.`,
          });
        }
      } else {
        unresolved.push({ name: group.name, ats, tried: res.tried, sampleUrls: mine.slice(0, 3).map((p) => p.url.href) });
      }
    } catch (err) {
      unresolved.push({ name: group.name, ats, tried: candidates, sampleUrls: mine.slice(0, 3).map((p) => p.url.href) });
      warnings.push({ company: group.name, message: `probe failed: ${(err as Error).message}` });
    }
  }

  // 3. Nothing scannable: record which platforms it uses.
  if (resolvedAts.size === 0 && probes.length === 0) {
    const platforms = new Set<string>();
    for (const { detection } of group.rows) {
      if (detection.kind === 'unsupported') platforms.add(detection.platform);
    }
    if (platforms.size === 0) platforms.add('no URL');
    unsupported.push({
      name: group.name,
      platforms: [...platforms],
      sampleUrls: group.rows.map((r) => r.row.url).filter(Boolean).slice(0, 3),
    });
  }
}

/** Company display name. Falls back to the board token when the name cell is empty or a URL. */
function cleanName(raw: string, detection: Detection): string {
  const name = raw.trim();
  if (name && !/^https?:\/\//i.test(name)) return name;
  return detection.kind === 'token' ? detection.token : '';
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
