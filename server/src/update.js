import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readVersion, rootDir } from './config.js';
import { UserError } from './users.js';

const RUNNING_TIMEOUT_MS = 15 * 60 * 1000;

function git(args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: rootDir, timeout }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr) }));
      else resolve(String(stdout).trim());
    });
  });
}

export function progressFile(dataDir) {
  return join(dataDir, 'update-progress.json');
}

export function readProgress(dataDir) {
  try {
    return JSON.parse(readFileSync(progressFile(dataDir), 'utf8'));
  } catch {
    return { step: null, status: null };
  }
}

function writeProgress(dataDir, data) {
  mkdirSync(dataDir, { recursive: true });
  const file = progressFile(dataDir);
  writeFileSync(file + '.tmp', JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  renameSync(file + '.tmp', file);
}

export function isRunning(progress, now = Date.now()) {
  if (progress.status !== 'running' || !progress.updatedAt) return false;
  return now - new Date(progress.updatedAt).getTime() < RUNNING_TIMEOUT_MS;
}

/** Poredi instaliranu verziju sa granom main na GitHubu. */
export async function checkForUpdate() {
  if (!existsSync(join(rootDir, '.git'))) {
    throw new UserError('Ova instalacija nije iz git repozitorijuma, pa ne može da se ažurira odavde.');
  }
  const local = await git(['rev-parse', 'HEAD']);
  try {
    await git(['fetch', 'origin', 'main', '--quiet'], 30000);
  } catch {
    throw new UserError('GitHub nije dostupan. Proveri internet vezu servera.', 502);
  }
  const remote = await git(['rev-parse', 'origin/main']);
  const currentVersion = readVersion();
  let latestVersion = currentVersion;
  let changes = [];
  if (local !== remote) {
    try {
      latestVersion = JSON.parse(await git(['show', 'origin/main:package.json'])).version;
    } catch {
      latestVersion = '?';
    }
    const log = await git(['log', '--format=%h%x09%s%x09%cI', '-n', '30', 'HEAD..origin/main']);
    changes = log
      ? log.split('\n').map((line) => {
          const [sha, subject, date] = line.split('\t');
          return { sha, subject, date };
        })
      : [];
  }
  return {
    currentVersion,
    currentCommit: local.slice(0, 7),
    latestVersion,
    latestCommit: remote.slice(0, 7),
    updateAvailable: local !== remote,
    changes,
  };
}

/**
 * Pokreće update.sh van servisa, jer će skripta restartovati servis.
 * Sa systemd-run skripta radi kao posebna jedinica i preživi restart; bez njega
 * se pokreće kao odvojen proces.
 */
export function startUpdate(dataDir) {
  const script = join(rootDir, 'update.sh');
  if (!existsSync(script) || !existsSync(join(rootDir, '.git'))) {
    throw new UserError('Ova instalacija nije iz git repozitorijuma, pa ne može da se ažurira odavde.');
  }
  if (isRunning(readProgress(dataDir))) throw new UserError('Ažuriranje je već u toku.', 409);
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    throw new UserError(
      'Server ne radi kao root, pa ne može sam da se ažurira. Pokreni: sudo radionica update',
    );
  }
  writeProgress(dataDir, { step: 'Pokrećem ažuriranje', status: 'running', message: '' });

  const log = openSync(join(dataDir, 'update.log'), 'a');
  const fail = (err) =>
    writeProgress(dataDir, {
      step: 'Greška',
      status: 'error',
      message: `Ažuriranje nije pokrenuto: ${err.message}`,
    });
  const direct = () => {
    const child = spawn('bash', [script], { cwd: rootDir, detached: true, stdio: ['ignore', log, log] });
    child.on('error', fail);
    child.unref();
  };
  const hasSystemdRun = existsSync('/usr/bin/systemd-run') || existsSync('/bin/systemd-run');
  if (!hasSystemdRun) return direct();
  // systemd-run odmah vraća kontrolu; ako ne uspe (npr. nema systemd), skripta se pokreće direktno.
  const unit = `radionica-update-${Date.now()}`;
  const runner = spawn('systemd-run', ['--unit', unit, '--collect', '--quiet', 'bash', script], {
    cwd: rootDir,
    stdio: ['ignore', log, log],
  });
  runner.on('error', direct);
  runner.on('exit', (code) => {
    if (code !== 0) direct();
  });
}
