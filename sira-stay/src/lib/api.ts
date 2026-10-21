import { API_URL } from './config';
import { reportServerReachable } from './network';

export { API_URL };

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public field?: string,
    public index?: number,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RequestOptions = {
  method?: Method;
  body?: unknown;
  form?: FormData;
  /** Override the default timeout (GET 15 s, other requests 30 s, uploads 120 s). */
  timeoutMs?: number;
  /** Automatic retries on network errors/timeouts. Defaults to 2 for GET, 0 otherwise. */
  retries?: number;
};

const RETRY_DELAYS_MS = [1000, 3000];
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const isConnectionError = (err: unknown) => err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT');

async function request<T>(path: string, method: Method, headers: Record<string, string>, payload: BodyInit | undefined, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(API_URL + path, { method, headers, body: payload, signal: controller.signal });
    } catch {
      throw controller.signal.aborted
        ? new ApiError('TIMEOUT', 0, 'The network is too slow right now.')
        : new ApiError('NETWORK', 0, `Cannot reach the server at ${API_URL}`);
    }
    let json: { error?: { code?: string; message?: string; field?: string; index?: number } } & Record<string, unknown>;
    try {
      json = await res.json();
    } catch {
      if (controller.signal.aborted) throw new ApiError('TIMEOUT', 0, 'The network is too slow right now.');
      json = {};
    }
    if (!res.ok) {
      const e = json?.error ?? {};
      throw new ApiError(e.code ?? 'SERVER_ERROR', res.status, e.message ?? 'Something went wrong.', e.field, e.index);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON API call with a timeout and automatic retry (GETs) on flaky networks.
 * Connection failures mark the server unreachable so the offline banner can show.
 */
export async function api<T>(path: string, { method, body, form, timeoutMs, retries }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const verb: Method = method ?? (payload ? 'POST' : 'GET');
  const timeout = timeoutMs ?? (form ? 120_000 : verb === 'GET' ? 15_000 : 30_000);
  const maxRetries = retries ?? (verb === 'GET' ? RETRY_DELAYS_MS.length : 0);

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await request<T>(path, verb, headers, payload, timeout);
      reportServerReachable(true);
      return result;
    } catch (err) {
      if (isConnectionError(err)) reportServerReachable(false);
      else if (err instanceof ApiError && err.status > 0) reportServerReachable(true);
      const retryable = isConnectionError(err) || (err instanceof ApiError && RETRYABLE_STATUS.has(err.status));
      if (!retryable || attempt >= maxRetries) throw err;
      await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
    }
  }
}

/** Listing photos are either absolute (demo data) or served by the API under /uploads. */
export const mediaUrl = (url: string | null | undefined) => (!url ? undefined : url.startsWith('http') ? url : API_URL + url);

/** React Native's FormData accepts { uri, name, type } objects for files. */
export const filePart = (uri: string, name: string, type: string) => ({ uri, name, type }) as unknown as Blob;
