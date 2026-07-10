// Typed fetch client. Handles cookies (session + CSRF) automatically.
// All errors throw an AppError with the structured { error: { code, message, details } } envelope.

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = opts;
  let url = path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const qstr = qs.toString();
    if (qstr) url += (path.includes('?') ? '&' : '?') + qstr;
  }

  const headers: Record<string, string> = {};
  const unsafe = method !== 'GET';
  if (unsafe) headers['Content-Type'] = 'application/json';
  if (unsafe) {
    const csrf = readCookie('pbx_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const ct = res.headers.get('content-type') ?? '';
  const data: unknown = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const env = data as { error?: { code?: string; message?: string; details?: unknown } };
    throw new AppError(
      res.status,
      env.error?.code ?? 'ERROR',
      env.error?.message ?? `HTTP ${res.status}`,
      env.error?.details,
    );
  }
  return data as T;
}

export const apiGet = <T>(path: string, query?: ApiOptions['query']) => api<T>(path, { method: 'GET', query });
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });

// Convenience hooks via TanStack Query
export { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
