import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, SESSION_COOKIE } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { ensureAdmin } from '../src/users.js';

/** Aplikacija nad privremenom bazom, sa admin nalogom. */
export function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'radionica-test-'));
  const ctx = { db: openDatabase(dataDir), dataDir };
  const adminPassword = ensureAdmin(ctx.db);
  const app = buildApp({ ctx, webDir: '/nepostojeca/fascikla' });
  const cleanup = async () => {
    await app.close();
    try {
      ctx.db.close();
    } catch {
      // već zatvorena
    }
    rmSync(dataDir, { recursive: true, force: true });
  };
  return { app, ctx, dataDir, adminPassword, cleanup };
}

export function cookieFrom(res) {
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE);
  return c ? `${SESSION_COOKIE}=${c.value}` : null;
}

export async function login(app, username, password) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  return { res, cookie: cookieFrom(res) };
}

/** Prijava kao admin sa već promenjenom lozinkom. */
export async function adminSession(app, tempPassword, newPassword = 'nova-lozinka-123') {
  const { cookie } = await login(app, 'admin', tempPassword);
  await app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: { cookie },
    payload: { currentPassword: tempPassword, newPassword },
  });
  return cookie;
}
