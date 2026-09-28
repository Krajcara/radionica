import { generateTempPassword, hashPassword } from './auth.js';
import { transaction } from './db.js';

export const ROLES = ['admin', 'korisnik', 'gost'];
export const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/;

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    disabled: Boolean(row.disabled),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function countUsers(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

function activeAdminCount(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get().n;
}

export function listUsers(db) {
  return db.prepare('SELECT * FROM users ORDER BY username').all().map(publicUser);
}

export function getUser(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function findUserByName(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/** Pravi korisnika sa privremenom lozinkom. Vraća korisnika i lozinku (prikazuje se samo jednom). */
export function createUser(db, { username, displayName = '', role }) {
  username = String(username ?? '').trim();
  if (!USERNAME_RE.test(username)) {
    throw new UserError('Korisničko ime: 2 do 32 znaka, samo slova, cifre, tačka, crtica i donja crta.');
  }
  if (!ROLES.includes(role)) throw new UserError('Nepoznata uloga.');
  if (findUserByName(db, username)) throw new UserError('Korisnik sa tim imenom već postoji.', 409);
  const tempPassword = generateTempPassword();
  const info = db
    .prepare(
      'INSERT INTO users (username, display_name, role, password_hash, must_change_password) VALUES (?, ?, ?, ?, 1)',
    )
    .run(username, String(displayName).trim().slice(0, 80), role, hashPassword(tempPassword));
  return { user: publicUser(getUser(db, Number(info.lastInsertRowid))), tempPassword };
}

/** Menja ime, ulogu ili isključuje nalog. Ne dozvoljava da ostane bez aktivnog admina. */
export function updateUser(db, actorId, id, { displayName, role, disabled }) {
  return transaction(db, () => {
    const row = getUser(db, id);
    if (!row) throw new UserError('Korisnik ne postoji.', 404);
    const next = {
      display_name: displayName !== undefined ? String(displayName).trim().slice(0, 80) : row.display_name,
      role: role !== undefined ? role : row.role,
      disabled: disabled !== undefined ? (disabled ? 1 : 0) : row.disabled,
    };
    if (!ROLES.includes(next.role)) throw new UserError('Nepoznata uloga.');
    if (id === actorId && (next.role !== 'admin' || next.disabled)) {
      throw new UserError('Ne možeš sebi da oduzmeš admin prava ni da isključiš svoj nalog.');
    }
    const wasActiveAdmin = row.role === 'admin' && !row.disabled;
    const staysActiveAdmin = next.role === 'admin' && !next.disabled;
    if (wasActiveAdmin && !staysActiveAdmin && activeAdminCount(db) <= 1) {
      throw new UserError('Mora da ostane bar jedan aktivan admin.');
    }
    db.prepare(
      "UPDATE users SET display_name = ?, role = ?, disabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    ).run(next.display_name, next.role, next.disabled, id);
    if (next.disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return publicUser(getUser(db, id));
  });
}

export function deleteUser(db, actorId, id) {
  return transaction(db, () => {
    const row = getUser(db, id);
    if (!row) throw new UserError('Korisnik ne postoji.', 404);
    if (id === actorId) throw new UserError('Ne možeš da obrišeš svoj nalog.');
    if (row.role === 'admin' && !row.disabled && activeAdminCount(db) <= 1) {
      throw new UserError('Mora da ostane bar jedan aktivan admin.');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
}

/** Postavlja novu privremenu lozinku, traži promenu pri prijavi i odjavljuje korisnika svuda. */
export function resetPassword(db, id) {
  const tempPassword = generateTempPassword();
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  ).run(hashPassword(tempPassword), id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  return tempPassword;
}

export function setPassword(db, id, password, { keepSessionHash } = {}) {
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  ).run(hashPassword(password), id);
  if (keepSessionHash) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(id, keepSessionHash);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
}

/**
 * Obezbeđuje admin nalog: ako ne postoji nijedan korisnik, pravi „admin“.
 * Ako force, postavlja novu privremenu lozinku nalogu „admin“ (pravi ga ako ne postoji) i uključuje ga.
 * Vraća privremenu lozinku ili null ako ništa nije promenjeno.
 */
export function ensureAdmin(db, { force = false } = {}) {
  const existing = findUserByName(db, 'admin');
  if (!force) {
    if (countUsers(db) > 0) return null;
    return createUser(db, { username: 'admin', displayName: 'Administrator', role: 'admin' }).tempPassword;
  }
  if (!existing) {
    return createUser(db, { username: 'admin', displayName: 'Administrator', role: 'admin' }).tempPassword;
  }
  db.prepare("UPDATE users SET role = 'admin', disabled = 0 WHERE id = ?").run(existing.id);
  return resetPassword(db, existing.id);
}
