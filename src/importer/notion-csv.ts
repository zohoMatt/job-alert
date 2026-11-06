import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

/** The columns the importer cares about. Other Notion columns are ignored. */
export interface SourceRow {
  line: number;
  companyName: string;
  url: string;
}

const NAME_COLUMNS = ['company name', 'company', 'name'];
const URL_COLUMNS = ['url', 'link', 'job url'];

/**
 * Reads a Notion database export. Only CSV is supported for now; Notion's HTML export
 * has the same rows (plus page ids) and could get its own reader here later.
 */
export async function readNotionExport(file: string): Promise<SourceRow[]> {
  const ext = path.extname(file).toLowerCase();
  if (ext !== '.csv') {
    throw new Error(`Unsupported input "${ext}". Export the Notion database as CSV.`);
  }
  return parseNotionCsv(await readFile(file, 'utf8'));
}

export function parseNotionCsv(text: string): SourceRow[] {
  const records: string[][] = parse(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });
  const [header, ...rows] = records;
  if (!header) return [];

  const lower = header.map((h) => h.trim().toLowerCase());
  const nameIdx = lower.findIndex((h) => NAME_COLUMNS.includes(h));
  const urlIdx = lower.findIndex((h) => URL_COLUMNS.includes(h));
  if (nameIdx < 0 || urlIdx < 0) {
    throw new Error(`CSV needs a company name column and a URL column. Found: ${header.join(', ')}`);
  }

  return rows.map((r, i) => ({
    line: i + 2,
    companyName: (r[nameIdx] ?? '').trim(),
    url: (r[urlIdx] ?? '').trim(),
  }));
}
