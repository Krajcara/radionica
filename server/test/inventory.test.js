import { afterEach, describe, expect, it } from 'vitest';
import { adminSession, setup } from './helpers.js';

let env;
afterEach(async () => env?.cleanup());

async function withAdmin() {
  env = setup();
  const cookie = await adminSession(env.app, env.adminPassword);
  return async (method, url, payload) => {
    const res = await env.app.inject({ method, url, headers: { cookie }, payload });
    let body;
    try {
      body = res.json();
    } catch {
      body = res.rawPayload;
    }
    return { status: res.statusCode, body, headers: res.headers };
  };
}

describe('lokacije', () => {
  it('predlaže oznake A, A-1, A-2 i ne dozvoljava istu oznaku dva puta', async () => {
    const call = await withAdmin();
    const regal = (await call('POST', '/api/locations', { type: 'regal', name: 'Regal' })).body.location;
    expect(regal.code).toBe('A');
    const p1 = (await call('POST', '/api/locations', { type: 'polica', parentId: regal.id })).body.location;
    const p2 = (await call('POST', '/api/locations', { type: 'polica', parentId: regal.id })).body.location;
    expect([p1.code, p2.code]).toEqual(['A-1', 'A-2']);
    const dup = await call('PATCH', `/api/locations/${p2.id}`, { code: 'a-1' });
    expect(dup.status).toBe(409);
    const byCode = await call('GET', '/api/locations/by-code/a-2');
    expect(byCode.body.id).toBe(p2.id);
  });

  it('ne može da se premesti u samu sebe, niti da se obriše dok nije prazna', async () => {
    const call = await withAdmin();
    const a = (await call('POST', '/api/locations', { type: 'regal' })).body.location;
    const b = (await call('POST', '/api/locations', { parentId: a.id })).body.location;
    expect((await call('PATCH', `/api/locations/${a.id}`, { parentId: b.id })).status).toBe(400);
    expect((await call('DELETE', `/api/locations/${a.id}`)).status).toBe(409);
    const item = (await call('POST', '/api/items', { name: 'Kleme', locationId: b.id })).body.item;
    expect((await call('DELETE', `/api/locations/${b.id}`)).status).toBe(409);
    await call('PATCH', `/api/items/${item.id}`, { locationId: null });
    expect((await call('DELETE', `/api/locations/${b.id}`)).status).toBe(200);
  });

  it('QR adresa vodi na lokaciju u aplikaciji', async () => {
    env = setup();
    const res = await env.app.inject({ method: 'GET', url: '/l/A-2-4' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/#/inventar/l/A-2-4');
  });
});

describe('stvari, kategorije i slike', () => {
  it('pravi stvar sa kategorijom i slikom, a slika se briše sa stvari', async () => {
    const call = await withAdmin();
    const inv0 = (await call('GET', '/api/inventory')).body;
    expect(inv0.categories.map((c) => c.name)).toContain('Elektrika');
    const cat = inv0.categories.find((c) => c.name === 'Elektrika');
    const item = (
      await call('POST', '/api/items', {
        name: 'WAGO 221',
        categoryId: cat.id,
        qty: 40,
        minQty: 10,
        unit: 'kom',
      })
    ).body.item;
    expect(item).toMatchObject({ name: 'WAGO 221', qty: 40, minQty: 10, categoryId: cat.id });

    const png = Buffer.from('fake-image-bytes').toString('base64');
    const photo = await call('POST', '/api/photos', {
      ownerType: 'item',
      ownerId: item.id,
      mime: 'image/jpeg',
      data: png,
      thumb: png,
    });
    expect(photo.status).toBe(201);
    const got = await call('GET', `/api/photos/${photo.body.photo.id}/thumb`);
    expect(got.status).toBe(200);

    await call('DELETE', `/api/items/${item.id}`);
    expect((await call('GET', '/api/inventory')).body.photos).toHaveLength(0);
  });

  it('brisanje kategorije ostavlja stvar bez kategorije', async () => {
    const call = await withAdmin();
    const cat = (await call('POST', '/api/categories', { name: 'Auto' })).body.category;
    expect((await call('POST', '/api/categories', { name: 'auto' })).status).toBe(409);
    const item = (await call('POST', '/api/items', { name: 'Dizalica', categoryId: cat.id })).body.item;
    await call('DELETE', `/api/categories/${cat.id}`);
    const inv = (await call('GET', '/api/inventory')).body;
    expect(inv.items.find((i) => i.id === item.id).categoryId).toBeNull();
  });
});

describe('pozajmice', () => {
  it('pozajmljuje i vraća, a ne pozajmljuje dva puta istu stvar', async () => {
    const call = await withAdmin();
    const item = (await call('POST', '/api/items', { name: 'Bušilica' })).body.item;
    const loan = (
      await call('POST', '/api/loans', { itemId: item.id, borrower: 'Marko', since: '2026-09-12' })
    ).body.loan;
    expect(loan).toMatchObject({ borrower: 'Marko', since: '2026-09-12', returnedAt: null });
    expect((await call('POST', '/api/loans', { itemId: item.id, borrower: 'Pera' })).status).toBe(409);
    const ret = (await call('POST', `/api/loans/${loan.id}/return`)).body.loan;
    expect(ret.returnedAt).toBeTruthy();
    expect((await call('POST', '/api/loans', { itemId: item.id, borrower: 'Pera' })).status).toBe(201);
  });
});
