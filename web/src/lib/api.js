/** Greška sa porukom sa servera, spremna za prikaz korisniku. */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let onUnauthorized = () => {};
/** Poziva se kad server kaže da sesija ne važi. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/auth/login') onUnauthorized();
    throw new ApiError(data?.error || `Greška ${res.status}`, res.status, data);
  }
  return data;
}

export const get = (url) => api('GET', url);
export const post = (url, body) => api('POST', url, body ?? {});
export const put = (url, body) => api('PUT', url, body);
export const patch = (url, body) => api('PATCH', url, body);
export const del = (url) => api('DELETE', url);

export const ROLE_LABELS = { admin: 'Admin', korisnik: 'Korisnik', gost: 'Gost' };
export const ROLE_HINTS = {
  admin: 'sve, uključujući korisnike, kopije i ažuriranje',
  korisnik: 'menja podatke',
  gost: 'samo gleda',
};

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('sr-Latn-RS', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
