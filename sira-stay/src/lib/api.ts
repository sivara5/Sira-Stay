import Constants from 'expo-constants';

/**
 * The API runs on the same laptop as the Expo dev server, so reuse the host Expo Go already
 * connected to (e.g. 192.168.1.5:8081 → http://192.168.1.5:4000). Override with EXPO_PUBLIC_API_URL.
 */
function resolveApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:4000`;
}

export const API_URL = resolveApiUrl();

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

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; form?: FormData };

export async function api<T>(path: string, { method, body, form }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: method ?? (payload ? 'POST' : 'GET'), headers, body: payload });
  } catch {
    throw new ApiError('NETWORK', 0, `Cannot reach the server at ${API_URL}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(e.code ?? 'SERVER_ERROR', res.status, e.message ?? 'Something went wrong.', e.field, e.index);
  }
  return json as T;
}

/** Listing photos are either absolute (demo data) or served by the API under /uploads. */
export const mediaUrl = (url: string | null | undefined) => (!url ? undefined : url.startsWith('http') ? url : API_URL + url);

/** React Native's FormData accepts { uri, name, type } objects for files. */
export const filePart = (uri: string, name: string, type: string) => ({ uri, name, type }) as unknown as Blob;
