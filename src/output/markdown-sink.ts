import type { EngineEmitter } from '../core/events.js';
import { localDate } from '../core/time.js';
import { readTextIfExists, writeFileAtomic } from '../store/fs-utils.js';
import { paths } from '../store/paths.js';
import { prependSection, renderScanSection } from './markdown.js';

export interface MarkdownSink {
  /** File the most recent matches went to (today's file before any match). */
  currentPath(): string;
  /** Files written during this run, oldest first. */
  writtenFiles(): string[];
  /** Resolves once every queued write has finished. */
  flush(): Promise<void>;
}

/**
 * Writes new matches to output/jobs-YYYY-MM-DD.md, newest scan on top.
 * Scans with no new matches are not written.
 */
export function attachMarkdownSink(events: EngineEmitter, keywords: string[]): MarkdownSink {
  let lastPath = paths.dailyMarkdown(localDate(new Date()));
  const written = new Set<string>();
  let queue: Promise<void> = Promise.resolve();

  events.on('scan:end', (report) => {
    if (report.newMatches.length === 0) return;
    const file = paths.dailyMarkdown(localDate(report.startedAt));
    lastPath = file;
    queue = queue
      .then(async () => {
        const existing = await readTextIfExists(file);
        await writeFileAtomic(file, prependSection(existing, renderScanSection(report, keywords), report.startedAt));
        written.add(file);
      })
      .catch((err: Error) => console.error(`Could not write ${file}: ${err.message}`));
  });

  return { currentPath: () => lastPath, writtenFiles: () => [...written], flush: () => queue };
}
