import { createReadStream, existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { checkNewPassword, createLoginLimiter, hashToken, newSessionToken, verifyPassword } from './auth.js';
import {
  DEFAULT_BACKUP_SETTINGS,
  backupPath,
  createBackup,
  listBackups,
  pruneBackups,
  restoreFile,
} from './backups.js';
import { readVersion } from './config.js';
import { getSetting, openDatabase, setSetting } from './db.js';
import { checkForUpdate, readProgress, startUpdate } from './update.js';
import { registerWorkshopRoutes } from './workshop.js';
import {
  ROLES,
  UserError,
  createUser,
  deleteUser,
  findUserByName,
  getUser,
  listUsers,
  publicUser,
  resetPassword,
  setPassword,
  updateUser,
} from './users.js';

export const SESSION_COOKIE = 'radionica_sesija';
const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Putanje koje rade bez prijave.
const PUBLIC_API = new Set(['/api/health', '/api/auth/login']);
// Putanje koje rade i kad korisnik mora prvo da promeni lozinku.
const ALLOWED_BEFORE_CHANGE = new Set(['/api/auth/me', '/api/auth/logout', '/api/auth/change-password']);

/**
 * Pravi Fastify aplikaciju.
 * @param {{ ctx: { db: import('node:sqlite').DatabaseSync, dataDir: string }, webDir: string,
 *           secureCookies?: boolean, logger?: boolean }} options
 * ctx.db može da se zameni u toku rada (vraćanje rezervne kopije), zato se uvek čita iz ctx.
 */
export function buildApp({ ctx, webDir, secureCookies = false, logger = false }) {
  const app = Fastify({ logger, trustProxy: true });
  const version = readVersion();
  const startedAt = new Date().toISOString();
  const limiter = createLoginLimiter();

  app.register(fastifyCookie);

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof UserError) return reply.code(err.status).send({ error: err.message });
    if (err.validation) return reply.code(400).send({ error: 'Neispravan zahtev.' });
    request.log.error(err);
    return reply.code(500).send({ error: 'Greška na serveru.' });
  });

  function startSession(reply, userId) {
    const token = newSessionToken();
    const expires = new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString();
    ctx.db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, expires);
    reply.setCookie(SESSION_COOKIE, token, cookieOptions);
  }

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/') || PUBLIC_API.has(path)) return;
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return reply.code(401).send({ error: 'Prijavi se.' });
    const tokenHash = hashToken(token);
    const row = ctx.db
      .prepare(
        `SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND u.disabled = 0`,
      )
      .get(tokenHash);
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      if (row) ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(401).send({ error: 'Sesija je istekla. Prijavi se ponovo.' });
    }
    // Produžava sesiju najviše jednom dnevno.
    if (new Date(row.expires_at).getTime() - Date.now() < (SESSION_DAYS - 1) * DAY_MS) {
      ctx.db
        .prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
        .run(new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString(), tokenHash);
      reply.setCookie(SESSION_COOKIE, token, cookieOptions);
    }
    request.user = row;
    request.sessionHash = tokenHash;
    if (row.must_change_password && !ALLOWED_BEFORE_CHANGE.has(path)) {
      return reply.code(403).send({ error: 'Prvo promeni privremenu lozinku.', mustChangePassword: true });
    }
  });

  const requireAdmin = async (request, reply) => {
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Samo admin može ovo.' });
  };
  const requireWrite = async (request, reply) => {
    if (!['admin', 'korisnik'].includes(request.user?.role)) {
      return reply.code(403).send({ error: 'Gost može samo da gleda.' });
    }
  };

  const workshop = registerWorkshopRoutes(app, ctx, { requireWrite });

  /* ---------- javno ---------- */

  app.get('/api/health', async () => ({ status: 'ok', version, startedAt }));

  app.post(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', maxLength: 64 },
            password: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      if (limiter.isLocked(request.ip, username)) {
        return reply.code(429).send({ error: 'Previše pogrešnih pokušaja. Pokušaj ponovo za 5 minuta.' });
      }
      const user = findUserByName(ctx.db, username.trim());
      if (!user || user.disabled || !verifyPassword(password, user.password_hash)) {
        limiter.fail(request.ip, username);
        return reply.code(401).send({ error: 'Pogrešno korisničko ime ili lozinka.' });
      }
      limiter.succeed(request.ip, username);
      ctx.db
        .prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .run(user.id);
      startSession(reply, user.id);
      return { user: publicUser(getUser(ctx.db, user.id)) };
    },
  );

  /* ---------- moj nalog ---------- */

  app.get('/api/auth/me', async (request) => ({ user: publicUser(request.user) }));

  app.post('/api/auth/logout', async (request, reply) => {
    ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(request.sessionHash);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post(
    '/api/auth/change-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', maxLength: 200 },
            newPassword: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request) => {
      const { currentPassword, newPassword } = request.body;
      if (!verifyPassword(currentPassword, request.user.password_hash)) {
        throw new UserError('Trenutna lozinka nije tačna.');
      }
      const problem = checkNewPassword(newPassword);
      if (problem) throw new UserError(problem);
      if (newPassword === currentPassword) throw new UserError('Nova lozinka mora da se razlikuje od stare.');
      // Ostale sesije se gase, ova ostaje.
      setPassword(ctx.db, request.user.id, newPassword, { keepSessionHash: request.sessionHash });
      return { user: publicUser(getUser(ctx.db, request.user.id)) };
    },
  );

  /* ---------- korisnici (admin) ---------- */

  const userBody = {
    type: 'object',
    properties: {
      username: { type: 'string', maxLength: 64 },
      displayName: { type: 'string', maxLength: 80 },
      role: { type: 'string', enum: ROLES },
      disabled: { type: 'boolean' },
    },
  };
  const idParam = { type: 'object', properties: { id: { type: 'integer' } } };

  app.get('/api/users', { preHandler: requireAdmin }, async () => ({ users: listUsers(ctx.db) }));

  app.post(
    '/api/users',
    { preHandler: requireAdmin, schema: { body: { ...userBody, required: ['username', 'role'] } } },
    async (request, reply) => {
      const result = createUser(ctx.db, request.body);
      return reply.code(201).send(result);
    },
  );

  app.patch(
    '/api/users/:id',
    { preHandler: requireAdmin, schema: { params: idParam, body: userBody } },
    async (request) => ({ user: updateUser(ctx.db, request.user.id, request.params.id, request.body) }),
  );

  app.post(
    '/api/users/:id/reset-password',
    { preHandler: requireAdmin, schema: { params: idParam } },
    async (request) => {
      const id = request.params.id;
      if (!getUser(ctx.db, id)) throw new UserError('Korisnik ne postoji.', 404);
      if (id === request.user.id) throw new UserError('Svoju lozinku menjaš u delu „Moj nalog“.');
      return { tempPassword: resetPassword(ctx.db, id) };
    },
  );

  app.delete('/api/users/:id', { preHandler: requireAdmin, schema: { params: idParam } }, async (request) => {
    deleteUser(ctx.db, request.user.id, request.params.id);
    return { ok: true };
  });

  /* ---------- rezervne kopije (admin) ---------- */

  const backupSettings = () => ({ ...DEFAULT_BACKUP_SETTINGS, ...getSetting(ctx.db, 'backup', {}) });

  app.get('/api/backups', { preHandler: requireAdmin }, async () => ({
    backups: listBackups(ctx.dataDir),
    settings: backupSettings(),
  }));

  app.put(
    '/api/backups/settings',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['enabled', 'hour', 'keep'],
          properties: {
            enabled: { type: 'boolean' },
            hour: { type: 'integer', minimum: 0, maximum: 23 },
            keep: { type: 'integer', minimum: 1, maximum: 365 },
          },
        },
      },
    },
    async (request) => {
      setSetting(ctx.db, 'backup', request.body);
      pruneBackups(ctx.dataDir, request.body.keep);
      return { settings: backupSettings() };
    },
  );

  app.post('/api/backups', { preHandler: requireAdmin }, async (request, reply) => {
    const backup = createBackup(ctx.db, ctx.dataDir, { suffix: 'rucna' });
    return reply.code(201).send({ backup });
  });

  const nameParam = { type: 'object', properties: { name: { type: 'string', maxLength: 80 } } };

  app.get(
    '/api/backups/:name',
    { preHandler: requireAdmin, schema: { params: nameParam } },
    async (request, reply) => {
      const path = backupPath(ctx.dataDir, request.params.name);
      if (!path) return reply.code(404).send({ error: 'Kopija ne postoji.' });
      reply.header('Content-Disposition', `attachment; filename="${request.params.name}"`);
      reply.type('application/vnd.sqlite3');
      return reply.send(createReadStream(path));
    },
  );

  app.post(
    '/api/backups/:name/restore',
    { preHandler: requireAdmin, schema: { params: nameParam } },
    async (request, reply) => {
      const path = backupPath(ctx.dataDir, request.params.name);
      if (!path) return reply.code(404).send({ error: 'Kopija ne postoji.' });
      const safety = createBackup(ctx.db, ctx.dataDir, { suffix: 'pre-vracanja' });
      ctx.db.close();
      try {
        restoreFile(ctx.dataDir, path);
      } finally {
        ctx.db = openDatabase(ctx.dataDir);
      }
      // Posle vraćanja svi se prijavljuju ponovo.
      ctx.db.exec('DELETE FROM sessions');
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true, safetyBackup: safety.name };
    },
  );

  /* ---------- ažuriranje (admin) ---------- */

  app.get('/api/update/check', { preHandler: requireAdmin }, async () => checkForUpdate());

  app.post('/api/update/run', { preHandler: requireAdmin }, async (request, reply) => {
    startUpdate(ctx.dataDir);
    request.log.warn(`Ažuriranje pokrenuo: ${request.user.username}`);
    return reply.code(202).send({ ok: true });
  });

  app.get('/api/update/progress', { preHandler: requireAdmin }, async () => readProgress(ctx.dataDir));

  /* ---------- izvoz podataka (admin) ---------- */

  app.get('/api/export', { preHandler: requireAdmin }, async (request, reply) => {
    const data = {
      app: 'radionica',
      version,
      exportedAt: new Date().toISOString(),
      users: listUsers(ctx.db).map(({ username, displayName, role, disabled }) => ({
        username,
        displayName,
        role,
        disabled,
      })),
      settings: Object.fromEntries(
        ctx.db
          .prepare('SELECT key, value FROM settings')
          .all()
          .map((r) => [r.key, JSON.parse(r.value)]),
      ),
      ...workshop.exportData(),
    };
    const day = data.exportedAt.slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="radionica-izvoz-${day}.json"`);
    return data;
  });

  /* ---------- prikaz ---------- */

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Nije pronađeno' });
    }
    if (existsSync(webDir)) {
      // Aplikacija na jednoj stranici: sve ostale putanje vraćaju index.html.
      return reply.sendFile('index.html');
    }
    return reply
      .code(503)
      .type('text/plain; charset=utf-8')
      .send('Frontend nije izgrađen. Pokreni: npm run build');
  });

  if (existsSync(webDir)) {
    app.register(fastifyStatic, { root: webDir, wildcard: false });
  }

  return app;
}
