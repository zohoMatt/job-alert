import pLimit from 'p-limit';

/**
 * Per-job detail fetches for platforms whose list API has no descriptions.
 *
 * Details are cached in memory per board, so a running watcher only fetches jobs it
 * has not seen yet. After each fetch a board's cache keeps only the jobs still listed.
 * A failed fetch yields `null` and is retried on the next scan.
 */
const cache = new Map<string, Map<string, unknown>>();

export async function fetchDetails<T, D>(
  boardId: string,
  items: T[],
  idOf: (item: T) => string,
  fetchOne: (item: T) => Promise<D>,
  concurrency = 4,
): Promise<Array<{ item: T; detail: D | null }>> {
  const previous = cache.get(boardId) ?? new Map<string, unknown>();
  const next = new Map<string, unknown>();
  const limit = pLimit(concurrency);

  const out = await Promise.all(
    items.map((item) =>
      limit(async () => {
        const id = idOf(item);
        if (previous.has(id)) {
          next.set(id, previous.get(id));
          return { item, detail: previous.get(id) as D };
        }
        try {
          const detail = await fetchOne(item);
          next.set(id, detail);
          return { item, detail };
        } catch {
          return { item, detail: null };
        }
      }),
    ),
  );

  cache.set(boardId, next);
  return out;
}

/** For tests. */
export function clearDetailCache(): void {
  cache.clear();
}

/**
 * Turns keywords into a server-side search string. Multi-word keywords are quoted
 * so they search as phrases. Empty when there are no keywords.
 */
export function searchText(keywords: string[] | undefined): string {
  return (keywords ?? []).map((k) => (/\s/.test(k.trim()) ? `"${k.trim()}"` : k.trim())).join(' ');
}

export function epochToIso(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
