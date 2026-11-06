import { z } from 'zod';
import { paths } from './paths.js';
import { readJsonIfExists, writeJsonAtomic } from './fs-utils.js';

const RunRecordSchema = z.object({
  startedAt: z.string(),
  /** Null while running, and also when the process was killed or the window closed. */
  stoppedAt: z.string().nullable(),
  lastScanAt: z.string().nullable(),
  scans: z.number().int().min(0),
  newMatches: z.number().int().min(0),
});

/** What happened in the most recent run. Used to offer "start with the same settings". */
export type RunRecord = z.infer<typeof RunRecordSchema>;

export async function loadLastRun(file = paths.lastRun): Promise<RunRecord | null> {
  try {
    const raw = await readJsonIfExists(file);
    if (raw == null) return null;
    const parsed = RunRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // unreadable or corrupt: treat as no previous run
  }
}

export async function saveLastRun(record: RunRecord, file = paths.lastRun): Promise<void> {
  await writeJsonAtomic(file, RunRecordSchema.parse(record));
}
