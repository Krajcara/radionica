// Inventar: lokacije, kategorije, stvari, slike i pozajmice.
import { transaction } from './db.js';
import { UserError } from './users.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
export const LOCATION_TYPES = [
  'prostorija',
  'regal',
  'polica',
  'kutija',
  'fiokar',
  'fioka',
  'ormar',
  'zid',
  'ostalo',
];
const CODE_RE = /^[A-Za-z0-9-]{1,20}$/;

const locApi = (r) => ({
  id: r.id,
  parentId: r.parent_id,
  type: r.type,
  name: r.name,
  code: r.code,
  note: r.note,
});
const itemApi = (r) => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id,
  locationId: r.location_id,
  qty: r.qty,
  unit: r.unit,
  minQty: r.min_qty,
  battery: r.battery,
  note: r.note,
  updatedAt: r.updated_at,
});
const loanApi = (r) => ({
  id: r.id,
  itemId: r.item_id,
  borrower: r.borrower,
  since: r.since,
  returnedAt: r.returned_at,
  note: r.note,
});

function isFk(err) {
  return /FOREIGN KEY/i.test(String(err?.message));
}
function isUnique(err) {
  return /UNIQUE/i.test(String(err?.message));
}

function update(db, table, id, map, body) {
  const cols = [];
  const vals = [];
  for (const [key, col] of Object.entries(map)) {
    if (!(key in body)) continue;
    let v = body[key];
    if (typeof v === 'string') v = v.trim();
    cols.push(`${col} = ?`);
    vals.push(v);
  }
  if (!cols.length) return;
  const hasUpdated = table !== 'categories' && table !== 'loans';
  const info = db
    .prepare(
      `UPDATE ${table} SET ${cols.join(', ')}${hasUpdated ? `, updated_at = ${NOW}` : ''} WHERE id = ?`,
    )
    .run(...vals, id);
  if (!info.changes) throw new UserError('Ne postoji.', 404);
}

/** Predlog kratke oznake: koren A, B, C…; ispod roditelja oznaka roditelja pa redni broj. */
export function suggestCode(db, parentId) {
  const taken = (c) => db.prepare('SELECT 1 FROM locations WHERE code = ?').get(c);
  if (!parentId) {
    for (let i = 0; i < 26 * 27; i++) {
      const c =
        i < 26
          ? String.fromCharCode(65 + i)
          : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
      if (!taken(c)) return c;
    }
    return null;
  }
  const parent = db.prepare('SELECT code FROM locations WHERE id = ?').get(parentId);
  const base = parent?.code || `L${parentId}`;
  for (let i = 1; i < 1000; i++) {
    const c = `${base}-${i}`;
    if (c.length <= 20 && !taken(c)) return c;
  }
  return null;
}

function wouldCycle(db, id, parentId) {
  let cur = parentId;
  for (let guard = 0; cur && guard < 1000; guard++) {
    if (cur === id) return true;
    cur = db.prepare('SELECT parent_id FROM locations WHERE id = ?').get(cur)?.parent_id ?? null;
  }
  return false;
}

export function registerInventoryRoutes(app, ctx, { requireWrite }) {
  const db = () => ctx.db;
  const idParam = { type: 'object', properties: { id: { type: 'integer' } } };
  const str = (max) => ({ type: 'string', maxLength: max });
  const numOrNull = { type: ['number', 'null'], minimum: 0, maximum: 1e9 };
  const intOrNull = { type: ['integer', 'null'], minimum: 1 };

  const photosMeta = () =>
    db()
      .prepare('SELECT id, owner_type, owner_id, created_at FROM photos ORDER BY id')
      .all()
      .map((r) => ({ id: r.id, ownerType: r.owner_type, ownerId: r.owner_id, createdAt: r.created_at }));

  app.get('/api/inventory', async () => ({
    locations: db().prepare('SELECT * FROM locations ORDER BY name COLLATE NOCASE, id').all().map(locApi),
    categories: db().prepare('SELECT * FROM categories ORDER BY name COLLATE NOCASE').all(),
    items: db().prepare('SELECT * FROM items ORDER BY name COLLATE NOCASE, id').all().map(itemApi),
    loans: db().prepare('SELECT * FROM loans ORDER BY since DESC, id DESC').all().map(loanApi),
    photos: photosMeta(),
    types: LOCATION_TYPES,
  }));

  /* ----- lokacije ----- */

  const locBody = {
    type: 'object',
    properties: {
      parentId: intOrNull,
      type: { type: 'string', enum: LOCATION_TYPES },
      name: str(80),
      code: { type: ['string', 'null'], maxLength: 20 },
      note: str(1000),
    },
    additionalProperties: false,
  };
  const checkCode = (code) => {
    if (code == null || code === '') return null;
    const c = String(code).trim().toUpperCase();
    if (!CODE_RE.test(c))
      throw new UserError('Oznaka sme da ima samo slova, cifre i crtice, najviše 20 znakova.');
    return c;
  };

  app.post(
    '/api/locations',
    { preHandler: requireWrite, schema: { body: locBody } },
    async (request, reply) => {
      const b = request.body;
      if (b.parentId && !db().prepare('SELECT 1 FROM locations WHERE id = ?').get(b.parentId)) {
        throw new UserError('Nadređena lokacija ne postoji.');
      }
      const code = b.code === undefined ? suggestCode(db(), b.parentId ?? null) : checkCode(b.code);
      try {
        const info = db()
          .prepare('INSERT INTO locations (parent_id, type, name, code, note) VALUES (?, ?, ?, ?, ?)')
          .run(b.parentId ?? null, b.type || 'kutija', (b.name || '').trim(), code, (b.note || '').trim());
        const row = db().prepare('SELECT * FROM locations WHERE id = ?').get(Number(info.lastInsertRowid));
        return reply.code(201).send({ location: locApi(row) });
      } catch (err) {
        if (isUnique(err)) throw new UserError(`Oznaka ${code} je već zauzeta.`, 409);
        throw err;
      }
    },
  );

  app.patch(
    '/api/locations/:id',
    { preHandler: requireWrite, schema: { params: idParam, body: locBody } },
    async (request) => {
      const id = request.params.id;
      const b = { ...request.body };
      if ('parentId' in b && b.parentId) {
        if (!db().prepare('SELECT 1 FROM locations WHERE id = ?').get(b.parentId)) {
          throw new UserError('Nadređena lokacija ne postoji.');
        }
        if (wouldCycle(db(), id, b.parentId))
          throw new UserError('Lokacija ne može da se premesti u samu sebe.');
      }
      if ('code' in b) b.code = checkCode(b.code);
      try {
        update(
          db(),
          'locations',
          id,
          { parentId: 'parent_id', type: 'type', name: 'name', code: 'code', note: 'note' },
          b,
        );
      } catch (err) {
        if (isUnique(err)) throw new UserError(`Oznaka ${b.code} je već zauzeta.`, 409);
        throw err;
      }
      return { location: locApi(db().prepare('SELECT * FROM locations WHERE id = ?').get(id)) };
    },
  );

  app.delete(
    '/api/locations/:id',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      const id = request.params.id;
      if (db().prepare('SELECT 1 FROM locations WHERE parent_id = ?').get(id)) {
        throw new UserError('U ovoj lokaciji ima drugih lokacija. Premesti ih ili obriši prvo.', 409);
      }
      if (db().prepare('SELECT 1 FROM items WHERE location_id = ?').get(id)) {
        throw new UserError('U ovoj lokaciji ima stvari. Premesti ih ili obriši prvo.', 409);
      }
      transaction(db(), () => {
        db().prepare("DELETE FROM photos WHERE owner_type = 'location' AND owner_id = ?").run(id);
        db().prepare('DELETE FROM locations WHERE id = ?').run(id);
      });
      return { ok: true };
    },
  );

  app.get('/api/locations/by-code/:code', async (request, reply) => {
    const row = db()
      .prepare('SELECT id FROM locations WHERE code = ?')
      .get(String(request.params.code).trim());
    if (!row)
      return reply.code(404).send({ error: `Lokacija sa oznakom ${request.params.code} ne postoji.` });
    return { id: row.id };
  });

  /* ----- kategorije ----- */

  const catBody = {
    type: 'object',
    required: ['name'],
    properties: { name: str(60) },
    additionalProperties: false,
  };

  app.post(
    '/api/categories',
    { preHandler: requireWrite, schema: { body: catBody } },
    async (request, reply) => {
      const name = request.body.name.trim();
      if (!name) throw new UserError('Upiši naziv kategorije.');
      try {
        const info = db().prepare('INSERT INTO categories (name) VALUES (?)').run(name);
        return reply.code(201).send({ category: { id: Number(info.lastInsertRowid), name } });
      } catch (err) {
        if (isUnique(err)) throw new UserError('Ta kategorija već postoji.', 409);
        throw err;
      }
    },
  );

  app.patch(
    '/api/categories/:id',
    { preHandler: requireWrite, schema: { params: idParam, body: catBody } },
    async (request) => {
      const name = request.body.name.trim();
      if (!name) throw new UserError('Upiši naziv kategorije.');
      try {
        update(db(), 'categories', request.params.id, { name: 'name' }, { name });
      } catch (err) {
        if (isUnique(err)) throw new UserError('Ta kategorija već postoji.', 409);
        throw err;
      }
      return { category: db().prepare('SELECT * FROM categories WHERE id = ?').get(request.params.id) };
    },
  );

  app.delete(
    '/api/categories/:id',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      db().prepare('DELETE FROM categories WHERE id = ?').run(request.params.id);
      return { ok: true };
    },
  );

  /* ----- stvari ----- */

  const itemBody = {
    type: 'object',
    properties: {
      name: str(120),
      categoryId: intOrNull,
      locationId: intOrNull,
      qty: { type: 'number', minimum: 0, maximum: 1e9 },
      unit: str(12),
      minQty: numOrNull,
      battery: str(60),
      note: str(2000),
    },
    additionalProperties: false,
  };
  const itemMap = {
    name: 'name',
    categoryId: 'category_id',
    locationId: 'location_id',
    qty: 'qty',
    unit: 'unit',
    minQty: 'min_qty',
    battery: 'battery',
    note: 'note',
  };
  const wrapFk = (fn) => {
    try {
      return fn();
    } catch (err) {
      if (isFk(err)) throw new UserError('Izabrana lokacija ili kategorija ne postoji.');
      throw err;
    }
  };

  app.post('/api/items', { preHandler: requireWrite, schema: { body: itemBody } }, async (request, reply) => {
    const b = { qty: 1, unit: 'kom', ...request.body };
    const cols = Object.keys(b).map((k) => itemMap[k]);
    const vals = Object.values(b).map((v) => (typeof v === 'string' ? v.trim() : v));
    const info = wrapFk(() =>
      db()
        .prepare(`INSERT INTO items (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...vals),
    );
    return reply.code(201).send({
      item: itemApi(db().prepare('SELECT * FROM items WHERE id = ?').get(Number(info.lastInsertRowid))),
    });
  });

  app.patch(
    '/api/items/:id',
    { preHandler: requireWrite, schema: { params: idParam, body: itemBody } },
    async (request) => {
      wrapFk(() => update(db(), 'items', request.params.id, itemMap, request.body));
      return { item: itemApi(db().prepare('SELECT * FROM items WHERE id = ?').get(request.params.id)) };
    },
  );

  app.delete('/api/items/:id', { preHandler: requireWrite, schema: { params: idParam } }, async (request) => {
    transaction(db(), () => {
      db().prepare("DELETE FROM photos WHERE owner_type = 'item' AND owner_id = ?").run(request.params.id);
      db().prepare('DELETE FROM items WHERE id = ?').run(request.params.id);
    });
    return { ok: true };
  });

  /* ----- slike ----- */

  const MAX_PHOTO = 4 * 1024 * 1024;
  app.post(
    '/api/photos',
    {
      preHandler: requireWrite,
      bodyLimit: 12 * 1024 * 1024,
      schema: {
        body: {
          type: 'object',
          required: ['ownerType', 'ownerId', 'data', 'thumb'],
          properties: {
            ownerType: { type: 'string', enum: ['item', 'location'] },
            ownerId: { type: 'integer', minimum: 1 },
            mime: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] },
            data: { type: 'string', maxLength: 8 * 1024 * 1024 },
            thumb: { type: 'string', maxLength: 1024 * 1024 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const b = request.body;
      const table = b.ownerType === 'item' ? 'items' : 'locations';
      if (!db().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(b.ownerId))
        throw new UserError('Ne postoji.', 404);
      const data = Buffer.from(b.data, 'base64');
      const thumb = Buffer.from(b.thumb, 'base64');
      if (!data.length || data.length > MAX_PHOTO) throw new UserError('Slika je prevelika.');
      const info = db()
        .prepare('INSERT INTO photos (owner_type, owner_id, mime, data, thumb) VALUES (?, ?, ?, ?, ?)')
        .run(b.ownerType, b.ownerId, b.mime || 'image/jpeg', data, thumb);
      const id = Number(info.lastInsertRowid);
      return reply.code(201).send({ photo: { id, ownerType: b.ownerType, ownerId: b.ownerId } });
    },
  );

  const sendPhoto = (col) => async (request, reply) => {
    const row = db().prepare(`SELECT mime, ${col} AS bytes FROM photos WHERE id = ?`).get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Slika ne postoji.' });
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.type(col === 'thumb' ? 'image/jpeg' : row.mime).send(Buffer.from(row.bytes));
  };
  app.get('/api/photos/:id', { schema: { params: idParam } }, sendPhoto('data'));
  app.get('/api/photos/:id/thumb', { schema: { params: idParam } }, sendPhoto('thumb'));

  app.delete(
    '/api/photos/:id',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      db().prepare('DELETE FROM photos WHERE id = ?').run(request.params.id);
      return { ok: true };
    },
  );

  /* ----- pozajmice ----- */

  app.post(
    '/api/loans',
    {
      preHandler: requireWrite,
      schema: {
        body: {
          type: 'object',
          required: ['itemId', 'borrower'],
          properties: {
            itemId: { type: 'integer', minimum: 1 },
            borrower: str(80),
            since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            note: str(500),
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const b = request.body;
      if (!b.borrower.trim()) throw new UserError('Upiši kome je pozajmljeno.');
      if (!db().prepare('SELECT 1 FROM items WHERE id = ?').get(b.itemId))
        throw new UserError('Stvar ne postoji.', 404);
      if (db().prepare('SELECT 1 FROM loans WHERE item_id = ? AND returned_at IS NULL').get(b.itemId)) {
        throw new UserError('Ova stvar je već pozajmljena.', 409);
      }
      const since = b.since || new Date().toISOString().slice(0, 10);
      const info = db()
        .prepare('INSERT INTO loans (item_id, borrower, since, note) VALUES (?, ?, ?, ?)')
        .run(b.itemId, b.borrower.trim(), since, (b.note || '').trim());
      return reply.code(201).send({
        loan: loanApi(db().prepare('SELECT * FROM loans WHERE id = ?').get(Number(info.lastInsertRowid))),
      });
    },
  );

  app.post(
    '/api/loans/:id/return',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      const info = db()
        .prepare('UPDATE loans SET returned_at = ? WHERE id = ? AND returned_at IS NULL')
        .run(new Date().toISOString().slice(0, 10), request.params.id);
      if (!info.changes) throw new UserError('Pozajmica ne postoji ili je već vraćena.', 404);
      return { loan: loanApi(db().prepare('SELECT * FROM loans WHERE id = ?').get(request.params.id)) };
    },
  );

  app.delete('/api/loans/:id', { preHandler: requireWrite, schema: { params: idParam } }, async (request) => {
    db().prepare('DELETE FROM loans WHERE id = ?').run(request.params.id);
    return { ok: true };
  });

  return {
    exportData: () => ({
      inventory: {
        locations: db().prepare('SELECT * FROM locations ORDER BY id').all().map(locApi),
        categories: db().prepare('SELECT * FROM categories ORDER BY id').all(),
        items: db().prepare('SELECT * FROM items ORDER BY id').all().map(itemApi),
        loans: db().prepare('SELECT * FROM loans ORDER BY id').all().map(loanApi),
      },
    }),
  };
}
