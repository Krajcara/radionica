import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(here, '..', '..');

/**
 * Učitava .env iz fascikle aplikacije u process.env, bez prepisivanja vrednosti
 * koje su već postavljene (npr. iz systemd EnvironmentFile).
 */
export function loadEnvFile(path = resolve(rootDir, '.env'), env = process.env) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (env[m[1]] === undefined) env[m[1]] = value;
  }
}

/** Podešavanja iz promenljivih okruženja (i .env), sa podrazumevanim vrednostima. */
export function loadConfig(env = process.env) {
  loadEnvFile(resolve(rootDir, '.env'), env);
  return {
    host: env.RADIONICA_HOST || '0.0.0.0',
    port: Number(env.RADIONICA_PORT || 8080),
    dataDir: resolve(rootDir, env.RADIONICA_DATA_DIR || 'data'),
    webDir: resolve(rootDir, env.RADIONICA_WEB_DIR || 'web/dist'),
    // Kolačić samo preko HTTPS-a. U kućnoj mreži preko HTTP-a ostaje isključeno.
    secureCookies: env.RADIONICA_SECURE_COOKIES === '1',
  };
}

export function readVersion() {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  return pkg.version;
}
