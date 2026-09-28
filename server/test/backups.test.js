import { afterEach, describe, expect, it } from 'vitest';
import { listBackups, pruneBackups } from '../src/backups.js';
import { adminSession, login, setup } from './helpers.js';

let env;
afterEach(async () => env?.cleanup());

describe('rezervne kopije', () => {
  it('pravi kopiju, prikazuje je i preuzima', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const made = await env.app.inject({ method: 'POST', url: '/api/backups', headers: { cookie } });
    expect(made.statusCode).toBe(201);
    const name = made.json().backup.name;
    expect(name).toMatch(/-rucna\.sqlite$/);

    const list = await env.app.inject({ method: 'GET', url: '/api/backups', headers: { cookie } });
    expect(list.json().backups.map((b) => b.name)).toContain(name);
    expect(list.json().settings).toMatchObject({ enabled: true, hour: 3, keep: 14 });

    const dl = await env.app.inject({ method: 'GET', url: `/api/backups/${name}`, headers: { cookie } });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');

    const bad = await env.app.inject({
      method: 'GET',
      url: '/api/backups/..%2Fradionica.sqlite',
      headers: { cookie },
    });
    expect(bad.statusCode).toBe(404);
  });

  it('vraćanje kopije vraća staro stanje i odjavljuje sve', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const name = (await env.app.inject({ method: 'POST', url: '/api/backups', headers: { cookie } })).json()
      .backup.name;
    // Posle kopije pravimo korisnika koji ne sme da postoji posle vraćanja.
    await env.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: 'privremeni', role: 'gost' },
    });
    const restore = await env.app.inject({
      method: 'POST',
      url: `/api/backups/${name}/restore`,
      headers: { cookie },
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().safetyBackup).toMatch(/-pre-vracanja\.sqlite$/);

    const me = await env.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);

    const again = await login(env.app, 'admin', 'nova-lozinka-123');
    expect(again.res.statusCode).toBe(200);
    const users = await env.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie: again.cookie },
    });
    expect(users.json().users.map((u) => u.username)).toEqual(['admin']);
  });

  it('brisanje starih kopija ne dira ručne kopije', async () => {
    env = setup();
    const { createBackup } = await import('../src/backups.js');
    createBackup(env.ctx.db, env.dataDir, { suffix: 'rucna' });
    for (let i = 0; i < 3; i++) createBackup(env.ctx.db, env.dataDir);
    pruneBackups(env.dataDir, 1);
    const names = listBackups(env.dataDir).map((b) => b.name);
    expect(names.filter((n) => n.endsWith('-rucna.sqlite'))).toHaveLength(1);
    expect(names.filter((n) => /\d{6}\.sqlite$/.test(n))).toHaveLength(1);
  });

  it('podešavanja kopija se čuvaju i proveravaju', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const ok = await env.app.inject({
      method: 'PUT',
      url: '/api/backups/settings',
      headers: { cookie },
      payload: { enabled: true, hour: 2, keep: 7 },
    });
    expect(ok.json().settings).toEqual({ enabled: true, hour: 2, keep: 7 });
    const bad = await env.app.inject({
      method: 'PUT',
      url: '/api/backups/settings',
      headers: { cookie },
      payload: { enabled: true, hour: 25, keep: 7 },
    });
    expect(bad.statusCode).toBe(400);
  });
});
