// Šifarnik materijala, lager i projekti.
import { DEFAULT_CUTTING, KINDS, computeProject, stockChanges } from '@radionica/shared';
import { getSetting, setSetting, transaction } from './db.js';
import { UserError } from './users.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/* ---------- opis polja: ime u API-ju, kolona u bazi, tip ---------- */

const F = {
  kind: { col: 'kind', type: 'enum', values: KINDS },
  name: { col: 'name', type: 'text', max: 120 },
  note: { col: 'note', type: 'text', max: 500 },
  thickness: { col: 'thickness', type: 'num', nullable: true },
  hasGrain: { col: 'has_grain', type: 'bool' },
  materialId: { col: 'material_id', type: 'int', nullable: true },
  length: { col: 'length', type: 'num', nullable: true },
  width: { col: 'width', type: 'num', nullable: true },
  grainDir: { col: 'grain', type: 'enum', values: ['l', 'w', 'none'] },
  grainFollow: { col: 'grain', type: 'bool' },
  planed: { col: 'planed', type: 'bool' },
  anyWall: { col: 'any_wall', type: 'bool' },
  qty: { col: 'qty', type: 'int' },
};

function schemaOf(fields) {
  const properties = {};
  for (const [key, f] of Object.entries(fields)) {
    let p;
    if (f.type === 'text') p = { type: 'string', maxLength: f.max };
    else if (f.type === 'enum') p = { type: 'string', enum: f.values };
    else if (f.type === 'bool') p = { type: 'boolean' };
    else if (f.type === 'int') p = { type: 'integer', minimum: 0, maximum: key === 'qty' ? 9999 : 2 ** 31 };
    else p = { type: 'number', minimum: 0, maximum: 100000 };
    if (f.nullable) p.type = [p.type, 'null'];
    properties[key] = p;
  }
  return { type: 'object', properties, additionalProperties: false };
}

function toApi(row, fields) {
  if (!row) return null;
  const out = { id: row.id };
  for (const [key, f] of Object.entries(fields)) {
    const v = row[f.col];
    out[key] = f.type === 'bool' ? Boolean(v) : v;
  }
  return out;
}

function toDb(body, fields) {
  const cols = [];
  const vals = [];
  for (const [key, f] of Object.entries(fields)) {
    if (!(key in body)) continue;
    let v = body[key];
    if (f.type === 'bool') v = v ? 1 : 0;
    if (f.type === 'text') v = String(v ?? '').trim();
    cols.push(f.col);
    vals.push(v);
  }
  return { cols, vals };
}

/* ---------- resursi ---------- */

const MATERIAL_FIELDS = {
  kind: F.kind,
  name: F.name,
  thickness: F.thickness,
  hasGrain: F.hasGrain,
  note: F.note,
};
const STOCK_FIELDS = {
  kind: F.kind,
  materialId: F.materialId,
  length: F.length,
  width: F.width,
  thickness: F.thickness,
  grain: F.grainDir,
  planed: F.planed,
  qty: F.qty,
  note: F.note,
};
const PART_FIELDS = {
  kind: F.kind,
  name: F.name,
  materialId: F.materialId,
  anyWall: F.anyWall,
  length: F.length,
  width: F.width,
  thickness: F.thickness,
  grain: F.grainFollow,
  planed: F.planed,
  qty: F.qty,
};

const listMaterials = (db) =>
  db
    .prepare('SELECT * FROM materials ORDER BY kind, name COLLATE NOCASE, thickness')
    .all()
    .map((r) => toApi(r, MATERIAL_FIELDS));
const listStock = (db) =>
  db
    .prepare('SELECT * FROM stock ORDER BY kind, id')
    .all()
    .map((r) => toApi(r, STOCK_FIELDS));
const listParts = (db, projectId) =>
  db
    .prepare('SELECT * FROM project_parts WHERE project_id = ? ORDER BY id')
    .all(projectId)
    .map((r) => ({ ...toApi(r, PART_FIELDS), projectId: r.project_id }));

function projectApi(db, row, withParts = true) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    doneAt: row.done_at,
    parts: withParts ? listParts(db, row.id) : undefined,
  };
}

export function getCuttingSettings(db) {
  return { ...DEFAULT_CUTTING, ...getSetting(db, 'cutting', {}) };
}

function checkMaterial(db, materialId, kind) {
  if (materialId == null) return;
  const m = db.prepare('SELECT kind FROM materials WHERE id = ?').get(materialId);
  if (!m) throw new UserError('Izabrani materijal ne postoji.');
  if (m.kind !== kind) throw new UserError('Materijal ne odgovara ovoj vrsti.');
}

function isFkError(err) {
  return /FOREIGN KEY/i.test(String(err?.message));
}

/** Uobičajeni materijali za prazan šifarnik. */
const DEFAULT_MATERIALS = [
  { kind: 'metal', name: '40x40', thickness: 2 },
  { kind: 'metal', name: '40x20', thickness: 1.5 },
  { kind: 'metal', name: '30x30', thickness: 2 },
  { kind: 'metal', name: '20x20', thickness: 1.5 },
  { kind: 'iverica', name: 'Bela', thickness: 18, hasGrain: false },
  { kind: 'iverica', name: 'Bela', thickness: 16, hasGrain: false },
  { kind: 'iverica', name: 'HDF bela', thickness: 3, hasGrain: false },
  { kind: 'sper', name: 'Breza', thickness: 12, hasGrain: true },
  { kind: 'sper', name: 'Breza', thickness: 18, hasGrain: true },
  { kind: 'drvo', name: 'bukva' },
  { kind: 'drvo', name: 'hrast' },
  { kind: 'drvo', name: 'smrča' },
];

export function registerWorkshopRoutes(app, ctx, { requireWrite }) {
  const db = () => ctx.db;
  const idParam = { type: 'object', properties: { id: { type: 'integer' } } };

  /* ----- šifarnik ----- */

  app.get('/api/materials', async () => ({ materials: listMaterials(db()) }));

  app.post(
    '/api/materials',
    {
      preHandler: requireWrite,
      schema: { body: { ...schemaOf(MATERIAL_FIELDS), required: ['kind', 'name'] } },
    },
    async (request, reply) => {
      const body = request.body;
      const { cols, vals } = toDb(body, MATERIAL_FIELDS);
      const info = db()
        .prepare(`INSERT INTO materials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...vals);
      const row = db().prepare('SELECT * FROM materials WHERE id = ?').get(Number(info.lastInsertRowid));
      return reply.code(201).send({ material: toApi(row, MATERIAL_FIELDS) });
    },
  );

  app.post('/api/materials/defaults', { preHandler: requireWrite }, async () => {
    let added = 0;
    for (const m of DEFAULT_MATERIALS) {
      const exists = db()
        .prepare(
          'SELECT id FROM materials WHERE kind = ? AND name = ? COLLATE NOCASE AND IFNULL(thickness, -1) = ?',
        )
        .get(m.kind, m.name, m.thickness ?? -1);
      if (exists) continue;
      db()
        .prepare('INSERT INTO materials (kind, name, thickness, has_grain) VALUES (?, ?, ?, ?)')
        .run(m.kind, m.name, m.thickness ?? null, m.hasGrain ? 1 : 0);
      added += 1;
    }
    return { added, materials: listMaterials(db()) };
  });

  app.patch(
    '/api/materials/:id',
    { preHandler: requireWrite, schema: { params: idParam, body: schemaOf(MATERIAL_FIELDS) } },
    async (request) => {
      const { kind: _ignored, ...body } = request.body;
      void _ignored;
      const { cols, vals } = toDb(body, MATERIAL_FIELDS);
      if (cols.length) {
        const info = db()
          .prepare(
            `UPDATE materials SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ${NOW} WHERE id = ?`,
          )
          .run(...vals, request.params.id);
        if (!info.changes) throw new UserError('Materijal ne postoji.', 404);
      }
      return {
        material: toApi(
          db().prepare('SELECT * FROM materials WHERE id = ?').get(request.params.id),
          MATERIAL_FIELDS,
        ),
      };
    },
  );

  app.delete(
    '/api/materials/:id',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      try {
        db().prepare('DELETE FROM materials WHERE id = ?').run(request.params.id);
      } catch (err) {
        if (isFkError(err))
          throw new UserError(
            'Materijal se koristi u lageru ili u nekom projektu, pa ne može da se obriše.',
            409,
          );
        throw err;
      }
      return { ok: true };
    },
  );

  /* ----- lager ----- */

  app.get('/api/stock', async () => ({ stock: listStock(db()) }));

  app.post(
    '/api/stock',
    { preHandler: requireWrite, schema: { body: { ...schemaOf(STOCK_FIELDS), required: ['kind'] } } },
    async (request, reply) => {
      const body = { qty: 1, ...request.body };
      checkMaterial(db(), body.materialId, body.kind);
      const { cols, vals } = toDb(body, STOCK_FIELDS);
      const info = db()
        .prepare(`INSERT INTO stock (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...vals);
      const row = db().prepare('SELECT * FROM stock WHERE id = ?').get(Number(info.lastInsertRowid));
      return reply.code(201).send({ item: toApi(row, STOCK_FIELDS) });
    },
  );

  app.patch(
    '/api/stock/:id',
    { preHandler: requireWrite, schema: { params: idParam, body: schemaOf(STOCK_FIELDS) } },
    async (request) => {
      const row = db().prepare('SELECT * FROM stock WHERE id = ?').get(request.params.id);
      if (!row) throw new UserError('Komad ne postoji.', 404);
      const { kind: _k, ...body } = request.body;
      void _k;
      checkMaterial(db(), body.materialId, row.kind);
      const { cols, vals } = toDb(body, STOCK_FIELDS);
      if (cols.length) {
        db()
          .prepare(
            `UPDATE stock SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ${NOW} WHERE id = ?`,
          )
          .run(...vals, row.id);
      }
      return { item: toApi(db().prepare('SELECT * FROM stock WHERE id = ?').get(row.id), STOCK_FIELDS) };
    },
  );

  app.delete('/api/stock/:id', { preHandler: requireWrite, schema: { params: idParam } }, async (request) => {
    db().prepare('DELETE FROM stock WHERE id = ?').run(request.params.id);
    return { ok: true };
  });

  /* ----- podešavanja krojenja ----- */

  const cuttingSchema = {
    type: 'object',
    properties: Object.fromEntries(
      Object.keys(DEFAULT_CUTTING).map((k) => [k, { type: 'number', minimum: 0, maximum: 100000 }]),
    ),
    additionalProperties: false,
  };

  app.get('/api/settings/cutting', async () => ({ settings: getCuttingSettings(db()) }));

  app.put(
    '/api/settings/cutting',
    { preHandler: requireWrite, schema: { body: cuttingSchema } },
    async (request) => {
      setSetting(db(), 'cutting', { ...getCuttingSettings(db()), ...request.body });
      return { settings: getCuttingSettings(db()) };
    },
  );

  /* ----- projekti ----- */

  const getProject = (id) => {
    const row = db().prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) throw new UserError('Projekat ne postoji.', 404);
    return row;
  };
  const assertOpen = (row) => {
    if (row.done_at) throw new UserError('Projekat je završen. Napravi kopiju ako hoćeš da ga menjaš.');
  };
  const touch = (id) => db().prepare(`UPDATE projects SET updated_at = ${NOW} WHERE id = ?`).run(id);

  app.get('/api/projects', async () => ({
    projects: db()
      .prepare('SELECT * FROM projects ORDER BY created_at DESC')
      .all()
      .map((r) => projectApi(db(), r)),
  }));

  const projectBody = {
    type: 'object',
    properties: { name: { type: 'string', maxLength: 120 }, note: { type: 'string', maxLength: 2000 } },
    additionalProperties: false,
  };

  app.post(
    '/api/projects',
    { preHandler: requireWrite, schema: { body: projectBody } },
    async (request, reply) => {
      const name = (request.body.name || '').trim() || 'Novi projekat';
      const info = db().prepare('INSERT INTO projects (name) VALUES (?)').run(name);
      return reply.code(201).send({ project: projectApi(db(), getProject(Number(info.lastInsertRowid))) });
    },
  );

  app.get('/api/projects/:id', { schema: { params: idParam } }, async (request) => ({
    project: projectApi(db(), getProject(request.params.id)),
  }));

  app.patch(
    '/api/projects/:id',
    { preHandler: requireWrite, schema: { params: idParam, body: projectBody } },
    async (request) => {
      const row = getProject(request.params.id);
      if (request.body.name !== undefined) {
        db()
          .prepare(`UPDATE projects SET name = ?, updated_at = ${NOW} WHERE id = ?`)
          .run(request.body.name.trim() || 'Bez naziva', row.id);
      }
      if (request.body.note !== undefined) {
        db()
          .prepare(`UPDATE projects SET note = ?, updated_at = ${NOW} WHERE id = ?`)
          .run(request.body.note, row.id);
      }
      return { project: projectApi(db(), getProject(row.id)) };
    },
  );

  app.delete(
    '/api/projects/:id',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      db().prepare('DELETE FROM projects WHERE id = ?').run(request.params.id);
      return { ok: true };
    },
  );

  app.post(
    '/api/projects/:id/copy',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request, reply) => {
      const row = getProject(request.params.id);
      const newId = transaction(db(), () => {
        const info = db()
          .prepare('INSERT INTO projects (name, note) VALUES (?, ?)')
          .run(`${row.name} (kopija)`.slice(0, 120), row.note);
        const id = Number(info.lastInsertRowid);
        db()
          .prepare(
            `INSERT INTO project_parts (project_id, kind, name, material_id, any_wall, length, width, thickness, grain, planed, qty)
             SELECT ?, kind, name, material_id, any_wall, length, width, thickness, grain, planed, qty
             FROM project_parts WHERE project_id = ? ORDER BY id`,
          )
          .run(id, row.id);
        return id;
      });
      return reply.code(201).send({ project: projectApi(db(), getProject(newId)) });
    },
  );

  /* ----- delovi projekta ----- */

  app.post(
    '/api/projects/:id/parts',
    {
      preHandler: requireWrite,
      schema: { params: idParam, body: { ...schemaOf(PART_FIELDS), required: ['kind'] } },
    },
    async (request, reply) => {
      const project = getProject(request.params.id);
      assertOpen(project);
      const body = { qty: 1, ...request.body };
      checkMaterial(db(), body.materialId, body.kind);
      const { cols, vals } = toDb(body, PART_FIELDS);
      const info = db()
        .prepare(
          `INSERT INTO project_parts (project_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
        )
        .run(project.id, ...vals);
      touch(project.id);
      const row = db().prepare('SELECT * FROM project_parts WHERE id = ?').get(Number(info.lastInsertRowid));
      return reply.code(201).send({ part: { ...toApi(row, PART_FIELDS), projectId: project.id } });
    },
  );

  const getPart = (id) => {
    const row = db().prepare('SELECT * FROM project_parts WHERE id = ?').get(id);
    if (!row) throw new UserError('Deo ne postoji.', 404);
    assertOpen(getProject(row.project_id));
    return row;
  };

  app.patch(
    '/api/parts/:id',
    { preHandler: requireWrite, schema: { params: idParam, body: schemaOf(PART_FIELDS) } },
    async (request) => {
      const row = getPart(request.params.id);
      const { kind: _k, ...body } = request.body;
      void _k;
      checkMaterial(db(), body.materialId, row.kind);
      const { cols, vals } = toDb(body, PART_FIELDS);
      if (cols.length) {
        db()
          .prepare(`UPDATE project_parts SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
          .run(...vals, row.id);
        touch(row.project_id);
      }
      const next = db().prepare('SELECT * FROM project_parts WHERE id = ?').get(row.id);
      return { part: { ...toApi(next, PART_FIELDS), projectId: row.project_id } };
    },
  );

  app.delete('/api/parts/:id', { preHandler: requireWrite, schema: { params: idParam } }, async (request) => {
    const row = getPart(request.params.id);
    db().prepare('DELETE FROM project_parts WHERE id = ?').run(row.id);
    touch(row.project_id);
    return { ok: true };
  });

  /* ----- završetak projekta ----- */

  app.post(
    '/api/projects/:id/finish',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      const row = getProject(request.params.id);
      assertOpen(row);
      const stockRows = db().prepare('SELECT * FROM stock ORDER BY id').all();
      const result = computeProject({
        parts: listParts(db(), row.id),
        stock: stockRows.map((r) => toApi(r, STOCK_FIELDS)),
        materials: listMaterials(db()),
        settings: getCuttingSettings(db()),
      });
      if (!result.placed)
        throw new UserError('Nijedan deo ne može da se iseče iz lagera, pa nema šta da se skine.');
      const { take, add } = stockChanges(result);
      transaction(db(), () => {
        for (const [stockId, count] of take) {
          db()
            .prepare('UPDATE stock SET qty = qty - ?, updated_at = ' + NOW + ' WHERE id = ?')
            .run(count, stockId);
        }
        db().prepare('DELETE FROM stock WHERE qty <= 0').run();
        for (const a of add) {
          const same = db()
            .prepare(
              `SELECT id FROM stock WHERE kind = ? AND material_id = ? AND IFNULL(length, -1) = ? AND IFNULL(width, -1) = ?
               AND IFNULL(thickness, -1) = ? AND grain = ? AND planed = ?`,
            )
            .get(
              a.kind,
              a.materialId,
              a.length ?? -1,
              a.width ?? -1,
              a.thickness ?? -1,
              a.grain || 'l',
              a.planed ? 1 : 0,
            );
          if (same)
            db().prepare(`UPDATE stock SET qty = qty + 1, updated_at = ${NOW} WHERE id = ?`).run(same.id);
          else {
            db()
              .prepare(
                `INSERT INTO stock (kind, material_id, length, width, thickness, grain, planed, qty, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
              )
              .run(
                a.kind,
                a.materialId,
                a.length ?? null,
                a.width ?? null,
                a.thickness ?? null,
                a.grain || 'l',
                a.planed ? 1 : 0,
                `ostatak: ${row.name}`.slice(0, 500),
              );
          }
        }
        db()
          .prepare(
            `UPDATE projects SET done_at = ${NOW}, done_by = ?, stock_before = ?, updated_at = ${NOW} WHERE id = ?`,
          )
          .run(request.user.id, JSON.stringify(stockRows), row.id);
      });
      return {
        project: projectApi(db(), getProject(row.id)),
        taken: [...take.values()].reduce((a, b) => a + b, 0),
        added: add.length,
        placed: result.placed,
        total: result.total,
      };
    },
  );

  app.post(
    '/api/projects/:id/undo',
    { preHandler: requireWrite, schema: { params: idParam } },
    async (request) => {
      const row = getProject(request.params.id);
      if (!row.done_at || !row.stock_before) throw new UserError('Projekat nije završen.');
      const rows = JSON.parse(row.stock_before);
      try {
        transaction(db(), () => {
          db().prepare('DELETE FROM stock').run();
          const ins = db().prepare(
            `INSERT INTO stock (id, kind, material_id, length, width, thickness, grain, planed, qty, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const r of rows) {
            ins.run(
              r.id,
              r.kind,
              r.material_id,
              r.length,
              r.width,
              r.thickness,
              r.grain,
              r.planed,
              r.qty,
              r.note,
              r.created_at,
              r.updated_at,
            );
          }
          db()
            .prepare(
              `UPDATE projects SET done_at = NULL, done_by = NULL, stock_before = NULL, updated_at = ${NOW} WHERE id = ?`,
            )
            .run(row.id);
        });
      } catch (err) {
        if (isFkError(err))
          throw new UserError(
            'Neki materijal iz tog stanja lagera je obrisan iz šifarnika, pa vraćanje nije moguće.',
          );
        throw err;
      }
      return { project: projectApi(db(), getProject(row.id)) };
    },
  );

  /* ----- za izvoz ----- */
  return {
    exportData: () => ({
      materials: listMaterials(db()),
      stock: listStock(db()),
      projects: db()
        .prepare('SELECT * FROM projects ORDER BY id')
        .all()
        .map((r) => projectApi(db(), r)),
    }),
  };
}
