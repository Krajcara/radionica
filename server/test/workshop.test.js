import { afterEach, describe, expect, it } from 'vitest';
import { adminSession, login, setup } from './helpers.js';

let env;
afterEach(async () => env?.cleanup());

async function withAdmin() {
  env = setup();
  const cookie = await adminSession(env.app, env.adminPassword);
  const call = async (method, url, payload) => {
    const res = await env.app.inject({ method, url, headers: { cookie }, payload });
    return { status: res.statusCode, body: res.json() };
  };
  return call;
}

describe('šifarnik', () => {
  it('pravi, menja i briše materijal, a ne da obrisati materijal koji se koristi', async () => {
    const call = await withAdmin();
    const m = (await call('POST', '/api/materials', { kind: 'metal', name: '40x40', thickness: 2 })).body
      .material;
    expect(m).toMatchObject({ kind: 'metal', name: '40x40', thickness: 2, hasGrain: false });

    const upd = await call('PATCH', `/api/materials/${m.id}`, { note: 'crna cev' });
    expect(upd.body.material.note).toBe('crna cev');

    const s = await call('POST', '/api/stock', { kind: 'metal', materialId: m.id, length: 3000, qty: 2 });
    expect(s.status).toBe(201);

    const del = await call('DELETE', `/api/materials/${m.id}`);
    expect(del.status).toBe(409);

    await call('DELETE', `/api/stock/${s.body.item.id}`);
    expect((await call('DELETE', `/api/materials/${m.id}`)).status).toBe(200);
  });

  it('dodaje uobičajene materijale samo jednom', async () => {
    const call = await withAdmin();
    const first = await call('POST', '/api/materials/defaults');
    expect(first.body.added).toBeGreaterThan(5);
    const second = await call('POST', '/api/materials/defaults');
    expect(second.body.added).toBe(0);
  });

  it('ne prihvata materijal druge vrste u lageru', async () => {
    const call = await withAdmin();
    const m = (await call('POST', '/api/materials', { kind: 'drvo', name: 'bukva' })).body.material;
    const bad = await call('POST', '/api/stock', { kind: 'metal', materialId: m.id, length: 1000 });
    expect(bad.status).toBe(400);
  });
});

describe('projekti', () => {
  async function prepare(call) {
    const cev = (await call('POST', '/api/materials', { kind: 'metal', name: '40x40', thickness: 2 })).body
      .material;
    const breza = (
      await call('POST', '/api/materials', { kind: 'sper', name: 'Breza', thickness: 12, hasGrain: true })
    ).body.material;
    await call('POST', '/api/stock', { kind: 'metal', materialId: cev.id, length: 3000, qty: 1 });
    await call('POST', '/api/stock', {
      kind: 'sper',
      materialId: breza.id,
      length: 1250,
      width: 600,
      grain: 'l',
    });
    const p = (await call('POST', '/api/projects', { name: 'Sto' })).body.project;
    await call('POST', `/api/projects/${p.id}/parts`, {
      kind: 'metal',
      name: 'Noga',
      materialId: cev.id,
      length: 700,
      qty: 4,
    });
    await call('POST', `/api/projects/${p.id}/parts`, {
      kind: 'sper',
      name: 'Polica',
      materialId: breza.id,
      length: 1200,
      width: 120,
      grain: true,
    });
    return { cev, breza, p };
  }

  it('završetak skida materijal i vraća ostatke, a poništavanje vraća lager', async () => {
    const call = await withAdmin();
    const { p } = await prepare(call);
    const before = (await call('GET', '/api/stock')).body.stock;

    const fin = await call('POST', `/api/projects/${p.id}/finish`);
    expect(fin.status).toBe(200);
    expect(fin.body).toMatchObject({ placed: 5, total: 5, taken: 2 });
    expect(fin.body.project.doneAt).toBeTruthy();

    const after = (await call('GET', '/api/stock')).body.stock;
    // Cev 3000 - 4 × (700 + 3) = 188: ispod 150? ne, 188 ostaje kao ostatak.
    expect(after.find((s) => s.kind === 'metal').length).toBe(188);
    expect(after.filter((s) => s.kind === 'sper').length).toBeGreaterThan(0);
    expect(after.every((s) => !before.some((b) => b.id === s.id))).toBe(true);

    const blocked = await call('POST', `/api/projects/${p.id}/parts`, {
      kind: 'metal',
      name: 'X',
      length: 100,
    });
    expect(blocked.status).toBe(400);

    const undo = await call('POST', `/api/projects/${p.id}/undo`);
    expect(undo.status).toBe(200);
    expect((await call('GET', '/api/stock')).body.stock).toEqual(before);
  });

  it('kopija projekta ima iste delove', async () => {
    const call = await withAdmin();
    const { p } = await prepare(call);
    const copy = (await call('POST', `/api/projects/${p.id}/copy`)).body.project;
    expect(copy.name).toBe('Sto (kopija)');
    expect(copy.parts.map((x) => x.name)).toEqual(['Noga', 'Polica']);
  });

  it('gost može da gleda, ali ne i da menja', async () => {
    const call = await withAdmin();
    await prepare(call);
    const { tempPassword } = (await call('POST', '/api/users', { username: 'gost1', role: 'gost' })).body;
    const { cookie } = await login(env.app, 'gost1', tempPassword);
    await env.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: tempPassword, newPassword: 'gostova-lozinka' },
    });
    const read = await env.app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } });
    expect(read.statusCode).toBe(200);
    const write = await env.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie },
      payload: { name: 'X' },
    });
    expect(write.statusCode).toBe(403);
  });

  it('podešavanja krojenja se čuvaju', async () => {
    const call = await withAdmin();
    const res = await call('PUT', '/api/settings/cutting', { kerfMetal: 2.5 });
    expect(res.body.settings.kerfMetal).toBe(2.5);
    expect(res.body.settings.buyMetal).toBe(6000);
  });
});
