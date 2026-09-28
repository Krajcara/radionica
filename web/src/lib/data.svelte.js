// Podaci koje dele stranice: šifarnik, lager i podešavanja krojenja.
import { del, get, patch, post, put } from './api.js';

export const store = $state({
  materials: [],
  stock: [],
  cutting: null,
  loaded: false,
  error: '',
});

export const saving = $state({ pending: 0, error: '' });

export async function loadAll() {
  store.error = '';
  try {
    const [m, s, c] = await Promise.all([
      get('/api/materials'),
      get('/api/stock'),
      get('/api/settings/cutting'),
    ]);
    store.materials = m.materials;
    store.stock = s.stock;
    store.cutting = c.settings;
    store.loaded = true;
  } catch (err) {
    store.error = err.message;
  }
}

export async function reloadStock() {
  store.stock = (await get('/api/stock')).stock;
}

async function track(promise) {
  saving.pending += 1;
  saving.error = '';
  try {
    return await promise;
  } catch (err) {
    saving.error = err.message;
    throw err;
  } finally {
    saving.pending -= 1;
  }
}

// Izmene u tabelama se šalju sa malim zakašnjenjem, spojene po redu.
const queues = new Map();
export function saveLater(url, changes, delay = 450) {
  const q = queues.get(url) || { body: {}, timer: null };
  Object.assign(q.body, changes);
  clearTimeout(q.timer);
  q.timer = setTimeout(() => {
    queues.delete(url);
    track(patch(url, q.body)).catch(() => {});
  }, delay);
  queues.set(url, q);
}

export const api = {
  create: (url, body) => track(post(url, body)),
  remove: (url) => track(del(url)),
  put: (url, body) => track(put(url, body)),
  post: (url, body) => track(post(url, body)),
  patch: (url, body) => track(patch(url, body)),
};

export function materialsOf(kind) {
  return store.materials.filter((m) => m.kind === kind);
}

export function materialById(id) {
  return store.materials.find((m) => m.id === id);
}
