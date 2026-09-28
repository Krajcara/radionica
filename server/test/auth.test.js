import { afterEach, describe, expect, it } from 'vitest';
import { createLoginLimiter, generateTempPassword, hashPassword, verifyPassword } from '../src/auth.js';
import { adminSession, cookieFrom, login, setup } from './helpers.js';

let env;
afterEach(async () => env?.cleanup());

describe('lozinke', () => {
  it('heš se proverava i ne prihvata pogrešnu lozinku', () => {
    const h = hashPassword('tajna-lozinka');
    expect(verifyPassword('tajna-lozinka', h)).toBe(true);
    expect(verifyPassword('druga', h)).toBe(false);
    expect(verifyPassword('x', 'neispravan')).toBe(false);
  });
  it('privremena lozinka ima tri grupe od po četiri znaka', () => {
    expect(generateTempPassword()).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
  });
  it('limiter zaključava posle 5 grešaka', () => {
    let t = 0;
    const l = createLoginLimiter({ now: () => t });
    for (let i = 0; i < 5; i++) l.fail('1.1.1.1', 'admin');
    expect(l.isLocked('1.1.1.1', 'admin')).toBe(true);
    expect(l.isLocked('1.1.1.1', 'drugi')).toBe(false);
    t += 5 * 60 * 1000 + 1;
    expect(l.isLocked('1.1.1.1', 'admin')).toBe(false);
  });
});

describe('prijava', () => {
  it('pogrešna lozinka daje 401', async () => {
    env = setup();
    const { res } = await login(env.app, 'admin', 'pogresna');
    expect(res.statusCode).toBe(401);
  });

  it('privremena lozinka traži promenu pre svega ostalog', async () => {
    env = setup();
    const { res, cookie } = await login(env.app, 'admin', env.adminPassword);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.mustChangePassword).toBe(true);

    const blocked = await env.app.inject({ method: 'GET', url: '/api/users', headers: { cookie } });
    expect(blocked.statusCode).toBe(403);

    const me = await env.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);

    const short = await env.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: env.adminPassword, newPassword: 'kratka' },
    });
    expect(short.statusCode).toBe(400);

    const ok = await env.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: env.adminPassword, newPassword: 'nova-lozinka-123' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.mustChangePassword).toBe(false);

    const users = await env.app.inject({ method: 'GET', url: '/api/users', headers: { cookie } });
    expect(users.statusCode).toBe(200);
  });

  it('posle 5 pogrešnih pokušaja prijava je zaključana', async () => {
    env = setup();
    for (let i = 0; i < 5; i++) await login(env.app, 'admin', 'pogresna');
    const { res } = await login(env.app, 'admin', env.adminPassword);
    expect(res.statusCode).toBe(429);
  });

  it('odjava gasi sesiju', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const out = await env.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const me = await env.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});

describe('korisnici', () => {
  it('admin pravi korisnika koji se prijavljuje privremenom lozinkom', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const created = await env.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: 'marko', displayName: 'Marko', role: 'korisnik' },
    });
    expect(created.statusCode).toBe(201);
    const { tempPassword, user } = created.json();
    expect(user.role).toBe('korisnik');

    const { res, cookie: markoCookie } = await login(env.app, 'marko', tempPassword);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.mustChangePassword).toBe(true);

    const dup = await env.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: 'Marko', role: 'gost' },
    });
    expect(dup.statusCode).toBe(409);

    // Korisnik koji nije admin ne vidi spisak korisnika.
    await env.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: markoCookie },
      payload: { currentPassword: tempPassword, newPassword: 'markova-lozinka' },
    });
    const forbidden = await env.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie: markoCookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('ne može da ostane bez admina i admin ne može da obriše sebe', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const me = (await env.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json()
      .user;
    const demote = await env.app.inject({
      method: 'PATCH',
      url: `/api/users/${me.id}`,
      headers: { cookie },
      payload: { role: 'korisnik' },
    });
    expect(demote.statusCode).toBe(400);
    const del = await env.app.inject({ method: 'DELETE', url: `/api/users/${me.id}`, headers: { cookie } });
    expect(del.statusCode).toBe(400);
  });

  it('isključen korisnik gubi sesiju i ne može da se prijavi', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const { tempPassword, user } = (
      await env.app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { cookie },
        payload: { username: 'pera', role: 'gost' },
      })
    ).json();
    const { cookie: peraCookie } = await login(env.app, 'pera', tempPassword);
    await env.app.inject({
      method: 'PATCH',
      url: `/api/users/${user.id}`,
      headers: { cookie },
      payload: { disabled: true },
    });
    const me = await env.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: peraCookie } });
    expect(me.statusCode).toBe(401);
    const { res } = await login(env.app, 'pera', tempPassword);
    expect(res.statusCode).toBe(401);
  });

  it('reset lozinke daje novu privremenu i odjavljuje korisnika', async () => {
    env = setup();
    const cookie = await adminSession(env.app, env.adminPassword);
    const { tempPassword, user } = (
      await env.app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { cookie },
        payload: { username: 'ana', role: 'korisnik' },
      })
    ).json();
    const first = await login(env.app, 'ana', tempPassword);
    const reset = await env.app.inject({
      method: 'POST',
      url: `/api/users/${user.id}/reset-password`,
      headers: { cookie },
    });
    const newTemp = reset.json().tempPassword;
    expect(newTemp).not.toBe(tempPassword);
    const me = await env.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: first.cookie },
    });
    expect(me.statusCode).toBe(401);
    expect(cookieFrom((await login(env.app, 'ana', newTemp)).res)).toBeTruthy();
  });
});
