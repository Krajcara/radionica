import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { isRunning, progressFile, readProgress } from '../src/update.js';
import { loadEnvFile } from '../src/config.js';
import { adminSession, setup } from './helpers.js';

let env;
afterEach(async () => env?.cleanup());

describe('ažuriranje', () => {
  it('bez fajla napretka vraća prazan korak', async () => {
    env = setup();
    expect(readProgress(env.dataDir)).toEqual({ step: null, status: null });
    const cookie = await adminSession(env.app, env.adminPassword);
    const res = await env.app.inject({ method: 'GET', url: '/api/update/progress', headers: { cookie } });
    expect(res.json()).toEqual({ step: null, status: null });
  });

  it('čita napredak koji upisuje update.sh', async () => {
    env = setup();
    writeFileSync(
      progressFile(env.dataDir),
      JSON.stringify({ step: 'Gradim prikaz', status: 'running', updatedAt: new Date().toISOString() }),
    );
    expect(readProgress(env.dataDir).step).toBe('Gradim prikaz');
  });

  it('staro „u toku“ se ne računa kao ažuriranje koje traje', () => {
    const now = Date.now();
    expect(isRunning({ status: 'running', updatedAt: new Date(now - 60_000).toISOString() }, now)).toBe(true);
    expect(isRunning({ status: 'running', updatedAt: new Date(now - 16 * 60_000).toISOString() }, now)).toBe(
      false,
    );
    expect(isRunning({ status: 'done', updatedAt: new Date(now).toISOString() }, now)).toBe(false);
  });

  it('samo admin sme da pokrene ažuriranje', async () => {
    env = setup();
    const res = await env.app.inject({ method: 'POST', url: '/api/update/run' });
    expect(res.statusCode).toBe(401);
  });
});

describe('.env', () => {
  it('učitava vrednosti, preskače komentare i ne prepisuje postojeće', () => {
    const file = `${process.env.TMPDIR || '/tmp'}/radionica-test.env`;
    writeFileSync(file, '# komentar\nRADIONICA_PORT=9090\nRADIONICA_HOST="127.0.0.1"\nNODE_ENV=production\n');
    const e = { NODE_ENV: 'test' };
    loadEnvFile(file, e);
    expect(e).toEqual({ NODE_ENV: 'test', RADIONICA_PORT: '9090', RADIONICA_HOST: '127.0.0.1' });
  });
});
