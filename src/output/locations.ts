import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../store/paths.js';

const DAILY_RE = /^jobs-\d{4}-\d{2}-\d{2}\.md$/;

/** Path relative to the current directory when it is inside it, otherwise absolute. */
export function displayPath(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file;
}

/** The most recent output/jobs-YYYY-MM-DD.md, or null if there is none. */
export async function latestDailyMarkdown(dir = paths.outputDir): Promise<string | null> {
  try {
    const names = (await readdir(dir)).filter((n) => DAILY_RE.test(n)).sort();
    const last = names.at(-1);
    return last ? path.join(dir, last) : null;
  } catch {
    return null;
  }
}
