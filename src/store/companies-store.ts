import { z } from 'zod';
import { ATS_IDS, type Company } from '../types.js';
import { paths } from './paths.js';
import { readJsonIfExists, writeJsonAtomic } from './fs-utils.js';

const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  ats: z.enum(ATS_IDS),
  token: z.string(),
  api: z.string(),
  source: z.enum(['notion', 'manual']),
  resolvedBy: z.enum(['url', 'probe', 'manual']),
  sampleUrls: z.array(z.string()),
});

/** Known to use a supported ATS, but no working token was found. No token is stored. */
const UnresolvedSchema = z.object({
  name: z.string(),
  ats: z.enum(ATS_IDS),
  tried: z.array(z.string()),
  sampleUrls: z.array(z.string()),
});

const UnsupportedSchema = z.object({
  name: z.string(),
  platforms: z.array(z.string()),
  sampleUrls: z.array(z.string()),
});

const CompaniesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  sourceFile: z.string().nullable(),
  companies: z.array(CompanySchema),
  unresolved: z.array(UnresolvedSchema),
  unsupported: z.array(UnsupportedSchema),
});

export type UnresolvedCompany = z.infer<typeof UnresolvedSchema>;
export type UnsupportedCompany = z.infer<typeof UnsupportedSchema>;
export type CompaniesFile = z.infer<typeof CompaniesFileSchema>;

export async function loadCompanies(file = paths.companies): Promise<CompaniesFile | null> {
  const raw = await readJsonIfExists(file);
  if (raw == null) return null;
  const parsed = CompaniesFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${file} is not a valid companies file:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export async function saveCompanies(data: CompaniesFile, file = paths.companies): Promise<void> {
  const sorted: CompaniesFile = {
    ...data,
    companies: [...data.companies].sort(byName),
    unresolved: [...data.unresolved].sort(byName),
    unsupported: [...data.unsupported].sort(byName),
  };
  await writeJsonAtomic(file, sorted);
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

export type { Company };

export function emptyCompaniesFile(): CompaniesFile {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceFile: null,
    companies: [],
    unresolved: [],
    unsupported: [],
  };
}
