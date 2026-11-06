import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readTextIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function readJsonIfExists(file: string): Promise<unknown | null> {
  const text = await readTextIfExists(file);
  return text == null ? null : JSON.parse(text);
}

/**
 * Write via a temp file + rename so a crash never leaves a half-written file.
 * On Windows the rename fails (EPERM/EBUSY/EACCES) while another program holds the
 * target open, e.g. antivirus or an editor; retry briefly, then write in place.
 */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, content, 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const locked = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!locked) throw err;
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      await writeFile(file, content, 'utf8');
      await unlink(tmp).catch(() => {});
      return;
    }
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(data, null, 2) + '\n');
}
