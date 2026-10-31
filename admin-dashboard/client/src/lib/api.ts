import { BASE_URL } from './basePath';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, params?: Query) {
  // BASE_URL is Vite's base (always ends with `/`), so relative `api/...` resolves under the mount path.
  const url = new URL(`api${path}`.replace(/^\//, ''), new URL(BASE_URL, window.location.origin));
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(method: string, path: string, body?: unknown, params?: Query): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new ApiError(res.status, data.message ?? 'Request failed', data.errors);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path, undefined, params),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string, params?: Query) => request<T>('DELETE', path, undefined, params),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const firstField = err.fieldErrors && Object.values(err.fieldErrors).flat()[0];
    return firstField ? `${err.message} ${firstField}` : err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
