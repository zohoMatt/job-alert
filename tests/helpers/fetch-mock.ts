import { vi } from 'vitest';

export interface RecordedRequest {
  url: string;
  method: string;
  body: unknown;
}

type Route = (url: string, method: string, body: unknown) => { status?: number; json?: unknown } | undefined;

/**
 * Replaces global fetch. `route` returns the response for a request, or undefined
 * for a 404. Returns the list of requests made.
 */
export function mockFetch(route: Route): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const res = route(url, method, body);
    const status = res?.status ?? (res ? 200 : 404);
    const text = res?.json === undefined ? '' : JSON.stringify(res.json);
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}
