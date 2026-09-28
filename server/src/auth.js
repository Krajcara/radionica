import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Heš lozinke u obliku scrypt$N$r$p$so$heš. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// Bez slova i cifara koji se lako pomešaju (0/O, 1/l/I).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Privremena lozinka koja se lako prepiše, npr. k7Rm-xP4q-9ZtW. */
export function generateTempPassword() {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export const PASSWORD_MIN_LENGTH = 8;

/** Vraća poruku o grešci ili null ako je lozinka prihvatljiva. */
export function checkNewPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Lozinka mora imati najmanje ${PASSWORD_MIN_LENGTH} znakova.`;
  }
  if (password.length > 200) return 'Lozinka je predugačka.';
  return null;
}

/**
 * Pamti neuspele prijave po adresi i korisničkom imenu.
 * Posle 5 grešaka prijava je zaključana 5 minuta.
 */
export function createLoginLimiter({ maxFailures = 5, lockMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const entries = new Map();
  const key = (ip, username) => `${ip}|${String(username).toLowerCase()}`;
  return {
    isLocked(ip, username) {
      const e = entries.get(key(ip, username));
      return Boolean(e && e.lockedUntil > now());
    },
    fail(ip, username) {
      const k = key(ip, username);
      const e = entries.get(k) || { count: 0, lockedUntil: 0 };
      if (e.lockedUntil && e.lockedUntil <= now()) {
        e.count = 0;
        e.lockedUntil = 0;
      }
      e.count += 1;
      if (e.count >= maxFailures) e.lockedUntil = now() + lockMs;
      entries.set(k, e);
    },
    succeed(ip, username) {
      entries.delete(key(ip, username));
    },
  };
}
