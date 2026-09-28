// Inventar u pregledaču: lokacije, kategorije, stvari, slike i pozajmice.
import { get } from './api.js';

export const inv = $state({
  locations: [],
  categories: [],
  items: [],
  loans: [],
  photos: [],
  types: [],
  loaded: false,
  error: '',
});

export const TYPE_LABELS = {
  prostorija: 'Prostorija',
  regal: 'Regal',
  polica: 'Polica',
  kutija: 'Kutija',
  fiokar: 'Fiokar',
  fioka: 'Fioka',
  ormar: 'Ormar',
  zid: 'Zid',
  ostalo: 'Ostalo',
};
export const UNITS = ['kom', 'par', 'set', 'pak', 'm', 'kg', 'l'];

export async function loadInventory() {
  inv.error = '';
  try {
    Object.assign(inv, await get('/api/inventory'), { loaded: true });
  } catch (err) {
    inv.error = err.message;
  }
}

export const locById = (id) => inv.locations.find((l) => l.id === id);
export const catById = (id) => inv.categories.find((c) => c.id === id);

export function locName(l) {
  if (!l) return 'bez lokacije';
  return l.name || `${TYPE_LABELS[l.type] || 'Lokacija'}${l.code ? ' ' + l.code : ''}`;
}

/** Put od korena do lokacije. */
export function pathOf(id) {
  const out = [];
  let cur = locById(id);
  for (let guard = 0; cur && guard < 100; guard++) {
    out.unshift(cur);
    cur = cur.parentId ? locById(cur.parentId) : null;
  }
  return out;
}
export const pathText = (id) => (id ? pathOf(id).map(locName).join(', ') : 'bez lokacije');

export const childrenOf = (id) =>
  inv.locations
    .filter((l) => (l.parentId ?? null) === (id ?? null))
    .sort(
      (a, b) =>
        (a.code || '').localeCompare(b.code || '', 'sr', { numeric: true }) ||
        locName(a).localeCompare(locName(b)),
    );

export function descendantIds(id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of childrenOf(out[i])) out.push(c.id);
  return out;
}

export function itemsIn(id, deep) {
  const ids = new Set(deep ? descendantIds(id) : [id]);
  return inv.items.filter((i) => ids.has(i.locationId));
}

/** Lokacije kao ravna lista sa uvlačenjem, za izbor u listi. */
export function locationOptions(excludeId) {
  const skip = excludeId ? new Set(descendantIds(excludeId)) : new Set();
  const out = [];
  const walk = (parentId, depth) => {
    for (const l of childrenOf(parentId)) {
      if (skip.has(l.id)) continue;
      out.push({
        value: l.id,
        label: `${'  '.repeat(depth)}${depth ? '└ ' : ''}${locName(l)}${l.code ? ` (${l.code})` : ''}`,
      });
      walk(l.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export const photosOf = (type, id) => inv.photos.filter((p) => p.ownerType === type && p.ownerId === id);
export const activeLoan = (itemId) => inv.loans.find((l) => l.itemId === itemId && !l.returnedAt);
export const isLow = (i) => i.minQty != null && i.qty < i.minQty;

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'dj');

/** Pretraga po stvarima i lokacijama. Svaka reč upita mora da se nađe. */
export function search(query, categoryId) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const match = (text) => words.every((w) => text.includes(w));
  const items = inv.items.filter((i) => {
    if (categoryId && i.categoryId !== categoryId) return false;
    if (!words.length) return true;
    const loc = i.locationId ? pathOf(i.locationId) : [];
    return match(
      norm(
        [
          i.name,
          i.note,
          i.battery,
          catById(i.categoryId)?.name,
          ...loc.map((l) => `${l.name} ${l.code}`),
        ].join(' '),
      ),
    );
  });
  const locations =
    words.length && !categoryId
      ? inv.locations.filter((l) => match(norm(`${l.name} ${l.code} ${l.note} ${TYPE_LABELS[l.type]}`)))
      : [];
  return { items, locations };
}
