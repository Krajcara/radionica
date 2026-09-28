import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { databasePath, getSetting } from './db.js';

export const BACKUP_NAME_RE = /^radionica-\d{8}-\d{6}(-[a-z-]+)?\.sqlite$/;
export const DEFAULT_BACKUP_SETTINGS = { enabled: true, hour: 3, keep: 14 };

export function backupDir(dataDir) {
  return join(dataDir, 'backups');
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Pravi doslednu kopiju baze dok aplikacija radi (VACUUM INTO). */
export function createBackup(db, dataDir, { suffix = '' } = {}) {
  const dir = backupDir(dataDir);
  mkdirSync(dir, { recursive: true });
  let name = `radionica-${stamp()}${suffix ? '-' + suffix : ''}.sqlite`;
  let i = 1;
  while (existsSync(join(dir, name))) {
    name = `radionica-${stamp(new Date(Date.now() + i * 1000))}${suffix ? '-' + suffix : ''}.sqlite`;
    i += 1;
  }
  const path = join(dir, name);
  db.prepare('VACUUM INTO ?').run(path);
  return describe(dir, name);
}

function describe(dir, name) {
  const st = statSync(join(dir, name));
  return { name, size: st.size, createdAt: st.mtime.toISOString() };
}

export function listBackups(dataDir) {
  const dir = backupDir(dataDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => BACKUP_NAME_RE.test(n))
    .map((n) => describe(dir, n))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Briše najstarije automatske kopije preko zadatog broja. Ručne i sigurnosne kopije se ne diraju. */
export function pruneBackups(dataDir, keep) {
  const auto = listBackups(dataDir).filter((b) => /^radionica-\d{8}-\d{6}\.sqlite$/.test(b.name));
  for (const b of auto.slice(Math.max(1, keep))) rmSync(join(backupDir(dataDir), b.name), { force: true });
}

export function backupPath(dataDir, name) {
  if (!BACKUP_NAME_RE.test(name)) return null;
  const path = join(backupDir(dataDir), name);
  return existsSync(path) ? path : null;
}

/**
 * Vraća bazu iz kopije. Pre toga pravi sigurnosnu kopiju trenutnog stanja.
 * Poziva se kad je baza zatvorena. Vraća ime sigurnosne kopije.
 */
export function restoreFile(dataDir, sourcePath, safetyBackupName) {
  const target = databasePath(dataDir);
  for (const ext of ['-wal', '-shm']) rmSync(target + ext, { force: true });
  copyFileSync(sourcePath, target);
  return safetyBackupName;
}

/** Proverava svakih nekoliko minuta da li je vreme za dnevnu kopiju. */
export function startBackupScheduler({ getDb, dataDir, log, intervalMs = 10 * 60 * 1000 }) {
  const tick = () => {
    try {
      const db = getDb();
      const s = { ...DEFAULT_BACKUP_SETTINGS, ...getSetting(db, 'backup', {}) };
      if (!s.enabled) return;
      const now = new Date();
      if (now.getHours() < s.hour) return;
      const today = stamp(now).slice(0, 8);
      const doneToday = listBackups(dataDir).some(
        (b) => /^radionica-\d{8}-\d{6}\.sqlite$/.test(b.name) && b.name.slice(10, 18) === today,
      );
      if (doneToday) return;
      const b = createBackup(db, dataDir);
      pruneBackups(dataDir, s.keep);
      log.info(`Dnevna rezervna kopija: ${b.name}`);
    } catch (err) {
      log.error(err, 'Dnevna rezervna kopija nije uspela');
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  setTimeout(tick, 5000).unref();
  return () => clearInterval(timer);
}
