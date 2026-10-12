// Centralized API client for the Athlon Django backend.
// Uses Django session authentication (sessionid + csrftoken cookies).
// All requests include credentials. Unsafe methods include X-CSRFToken header.

// Empty string = relative URLs, proxied by Vite dev server to Django on localhost:8000.
// Set VITE_API_BASE_URL for production or non-proxied deployments.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match?.[1] ?? '';
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super(data['detail'] as string ?? `HTTP ${status}`);
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, ...init } = options;
  const method = (init.method ?? 'GET').toUpperCase();
  const isUnsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url = `${url}?${qs}`;
  }

  const response = await fetch(url, {
    ...init,
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(isUnsafe ? { 'X-CSRFToken': getCsrfToken() } : {}),
      ...init.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status, json as Record<string, unknown>);
  }

  return json as T;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) =>
    request<T>(path, { params }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),

  delete: <T = void>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

// WebSocket base URL — when using the Vite proxy, derive from current page origin.
export function getWsBase(): string {
  if (!API_BASE) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}`;
  }
  return API_BASE.replace(/^http/, 'ws');
}
