export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    body: string,
  ) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 120)}` : ''}`);
    this.name = 'HttpError';
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Extra attempts after the first one, for network errors and 5xx/429 only. */
  retries?: number;
}

const USER_AGENT = 'job-alert/0.1 (personal job board watcher)';

export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const { timeoutMs = 30_000, retries = 1 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1_000 * attempt);
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new HttpError(res.status, url, await res.text().catch(() => ''));
        if (res.status === 429 || res.status >= 500) {
          lastError = err;
          continue;
        }
        throw err;
      }
      return await res.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastError = err; // network error / timeout / bad JSON: retry
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
