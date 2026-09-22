// In dev, requests stay relative — Vite's proxy forwards /api to localhost:5000 same-origin,
// which is what lets the httpOnly refresh cookie "just work" (see vite.config.js).
// In production the frontend (Vercel) and API (Render) are different origins, so VITE_API_URL
// must point at the API's own origin — no trailing slash, no /api suffix (that's appended here,
// once, so it's never duplicated and never needs to be remembered when setting the var).
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const BASE = `${API_ORIGIN}/api`;

/**
 * Resolves a path the server already handed back as a full relative URL — e.g. a document's
 * `fileUrl: "/api/documents/<id>/file?token=..."` — against the API's origin instead of the
 * current page's origin. Without this, such a request would silently hit the frontend's own
 * domain in a split deployment (404) rather than the API.
 */
const resolveUrl = (url) => (/^https?:\/\//i.test(url) ? url : API_ORIGIN + url);

let accessToken = null;
let refreshPromise = null;
let unauthorizedHandler = null;

// These endpoints report credential problems themselves — never retry them via refresh.
const NO_REFRESH = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password']);

const FALLBACK_MESSAGES = {
  400: 'The request was invalid.',
  403: "You don't have access to this.",
  404: "We couldn't find that.",
  409: 'That conflicts with existing data.',
  413: 'That is too large to save.',
  429: 'Too many requests — please wait a moment.',
  500: 'Something went wrong on our side. Please try again.',
  502: 'The server is temporarily unavailable. Please try again shortly.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: 'The request took too long. Please try again.',
};

export class ApiError extends Error {
  constructor(status, message, { details, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }

  /** Maps validation details to `{ field: message }` for forms. */
  get fieldErrors() {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

export const setAccessToken = (token) => {
  accessToken = token;
};

export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};

function buildUrl(path, query) {
  const url = BASE + path;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession() {
  refreshPromise ??= fetch(buildUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      const body = await parseBody(res);
      if (!res.ok) throw new ApiError(res.status, body?.error?.message ?? 'Session expired', body?.error);
      accessToken = body.data.accessToken;
      return body.data;
    })
    .catch((err) => {
      if (err instanceof ApiError) throw err;
      throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/** Performs a request and returns the full `{ data, meta }` payload. */
export async function request(path, { method = 'GET', body, query, signal, retry = true } = {}) {
  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && retry && !NO_REFRESH.has(path)) {
    try {
      await refreshSession();
    } catch (err) {
      if (err.status === 0) throw err; // offline — keep the user signed in
      accessToken = null;
      unauthorizedHandler?.();
      throw new ApiError(401, 'Your session has expired. Please sign in again.', { code: 'SESSION_EXPIRED' });
    }
    return request(path, { method, body, query, signal, retry: false });
  }

  const payload = await parseBody(res);
  if (!res.ok) {
    const message = payload?.error?.message ?? FALLBACK_MESSAGES[res.status] ?? FALLBACK_MESSAGES[500];
    throw new ApiError(res.status, message, payload?.error ?? {});
  }
  return payload;
}

const unwrap = (promise) => promise.then((payload) => payload?.data ?? null);

/** Multipart upload (FormData) with the same auth/refresh behaviour as `request`. */
export async function uploadForm(path, formData, { retry = true } = {}) {
  let res;
  try {
    res = await fetch(buildUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', ...(accessToken && { Authorization: `Bearer ${accessToken}` }) },
      body: formData,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && retry) {
    try {
      await refreshSession();
    } catch (err) {
      if (err.status === 0) throw err;
      accessToken = null;
      unauthorizedHandler?.();
      throw new ApiError(401, 'Your session has expired. Please sign in again.', { code: 'SESSION_EXPIRED' });
    }
    return uploadForm(path, formData, { retry: false });
  }
  const payload = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, payload?.error?.message ?? FALLBACK_MESSAGES[res.status] ?? FALLBACK_MESSAGES[500], payload?.error ?? {});
  return payload?.data ?? null;
}

/** Fetches a protected file (signed URL + bearer token) and returns a Response. */
export async function fetchFile(url) {
  const resolved = resolveUrl(url);
  let res = await fetch(resolved, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (res.status === 401) {
    await refreshSession();
    res = await fetch(resolved, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  }
  if (!res.ok) throw new ApiError(res.status, FALLBACK_MESSAGES[res.status] ?? 'Could not load file');
  return res;
}

/** Fetches a protected file as a blob URL (for <img>/<iframe> previews). */
export const fetchBlobUrl = (url) => fetchFile(url).then((res) => res.blob()).then((blob) => URL.createObjectURL(blob));

export const api = {
  get: (path, query, options) => unwrap(request(path, { query, ...options })),
  post: (path, body = {}) => unwrap(request(path, { method: 'POST', body })),
  patch: (path, body = {}) => unwrap(request(path, { method: 'PATCH', body })),
  put: (path, body = {}) => unwrap(request(path, { method: 'PUT', body })),
  del: (path, body) => unwrap(request(path, { method: 'DELETE', body })),
};
