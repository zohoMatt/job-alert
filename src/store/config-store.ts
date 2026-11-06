import { z } from 'zod';
import { paths } from './paths.js';
import { readJsonIfExists, writeJsonAtomic } from './fs-utils.js';

export const MIN_INTERVAL_MINUTES = 60;

const ConfigSchema = z.object({
  companyIds: z.array(z.string()).min(1),
  keywords: z.array(z.string()).min(1),
  intervalMinutes: z.number().int().min(MIN_INTERVAL_MINUTES),
});

export type RunConfig = z.infer<typeof ConfigSchema>;

/** Returns the last saved config, or null if missing or invalid. */
export async function loadConfig(file = paths.config): Promise<RunConfig | null> {
  const raw = await readJsonIfExists(file);
  if (raw == null) return null;
  const parsed = ConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveConfig(config: RunConfig, file = paths.config): Promise<void> {
  await writeJsonAtomic(file, ConfigSchema.parse(config));
}
