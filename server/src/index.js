import { buildApp } from './app.js';
import { startBackupScheduler } from './backups.js';
import { loadConfig, readVersion } from './config.js';
import { openDatabase } from './db.js';
import { ensureAdmin } from './users.js';

const config = loadConfig();
const ctx = { db: openDatabase(config.dataDir), dataDir: config.dataDir };
const app = buildApp({ ctx, webDir: config.webDir, secureCookies: config.secureCookies, logger: true });

const temp = ensureAdmin(ctx.db);
if (temp) {
  if (process.env.NODE_ENV === 'production') {
    app.log.warn(
      'Napravljen je nalog admin. Privremenu lozinku dobijaš komandom: sudo radionica reset-admin',
    );
  } else {
    app.log.warn(`Napravljen je nalog admin sa privremenom lozinkom: ${temp}`);
  }
}

const stopScheduler = startBackupScheduler({ getDb: () => ctx.db, dataDir: config.dataDir, log: app.log });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Radionica ${readVersion()} radi na portu ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    stopScheduler();
    await app.close();
    ctx.db.close();
    process.exit(0);
  });
}
