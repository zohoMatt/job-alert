import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { readTextIfExists } from './fs-utils.js';
import { paths } from './paths.js';

const DAILY_RE = /^jobs-\d{4}-\d{2}-\d{2}\.md$/;

export interface LocalResults {
  /** Daily Markdown files, oldest first. */
  dailyFiles: string[];
  /** Number of records in matches.jsonl. */
  matches: number;
  /** Every file `clearResults` would delete. */
  files: string[];
}

/** What is in the output folder now. */
export async function describeResults(dir = paths.outputDir): Promise<LocalResults> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    // no output folder yet
  }
  const dailyFiles = names.filter((n) => DAILY_RE.test(n)).sort().map((n) => path.join(dir, n));
  const logFile = path.join(dir, path.basename(paths.matchLog));
  const log = await readTextIfExists(logFile);
  const matches = log ? log.split('\n').filter((l) => l.trim()).length : 0;
  return { dailyFiles, matches, files: log == null ? dailyFiles : [...dailyFiles, logFile] };
}

/**
 * Deletes the search results: the daily Markdown files and matches.jsonl. Other files
 * in the folder are left alone. Afterwards every current match counts as new again.
 */
export async function clearResults(dir = paths.outputDir): Promise<LocalResults> {
  const found = await describeResults(dir);
  for (const f of found.files) await rm(f, { force: true });
  return found;
}
