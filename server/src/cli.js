// Komande za server: sudo radionica <komanda>
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { backupPath, createBackup, listBackups, restoreFile } from './backups.js';
import { loadConfig, readVersion } from './config.js';
import { openDatabase } from './db.js';
import { ensureAdmin } from './users.js';

const [command, ...args] = process.argv.slice(2);
const config = loadConfig();

const help = `Upotreba: radionica <komanda>

  init            priprema bazu i pravi admin nalog ako nema korisnika
  reset-admin     nova privremena lozinka za nalog admin
  backup          pravi rezervnu kopiju baze
  update          ažurira aplikaciju sa GitHuba
  backups         spisak rezervnih kopija
  restore <fajl>  vraća bazu iz kopije (ime iz spiska ili putanja)
  version         verzija aplikacije
  status          stanje servisa
  logs [n]        poslednjih n linija dnevnika (podrazumevano 100)
  restart         restart servisa
`;

function run() {
  switch (command) {
    case 'init': {
      const db = openDatabase(config.dataDir);
      const temp = ensureAdmin(db);
      db.close();
      if (temp) console.log(`ADMIN_PASSWORD=${temp}`);
      else console.log('Baza je spremna. Korisnici već postoje.');
      return 0;
    }
    case 'reset-admin': {
      const db = openDatabase(config.dataDir);
      const temp = ensureAdmin(db, { force: true });
      db.close();
      console.log('Nalog: admin');
      console.log(`Privremena lozinka: ${temp}`);
      console.log('Pri prijavi ćeš morati da je promeniš.');
      return 0;
    }
    case 'backup': {
      const label = args[0] || 'rucna';
      if (!/^[a-z-]{1,30}$/.test(label)) {
        console.error('Oznaka kopije sme da ima samo mala slova i crtice.');
        return 1;
      }
      const db = openDatabase(config.dataDir);
      const b = createBackup(db, config.dataDir, { suffix: label });
      db.close();
      console.log(`Napravljena kopija: ${b.name}`);
      return 0;
    }
    case 'backups': {
      const list = listBackups(config.dataDir);
      if (!list.length) console.log('Nema rezervnih kopija.');
      for (const b of list) console.log(`${b.name}  ${(b.size / 1024).toFixed(0)} KB`);
      return 0;
    }
    case 'restore': {
      const keepSessions = args.includes('--zadrzi-sesije');
      const arg = args.find((a) => !a.startsWith('--'));
      if (!arg) {
        console.error('Navedi kopiju: radionica restore <ime ili putanja>');
        return 1;
      }
      const path = backupPath(config.dataDir, arg) || (existsSync(arg) ? resolve(arg) : null);
      if (!path) {
        console.error(`Kopija ne postoji: ${arg}`);
        return 1;
      }
      let db = openDatabase(config.dataDir);
      const safety = createBackup(db, config.dataDir, { suffix: 'pre-vracanja' });
      db.close();
      restoreFile(config.dataDir, path);
      db = openDatabase(config.dataDir);
      // Posle ručnog vraćanja svi se prijavljuju ponovo. Pri vraćanju posle
      // neuspelog ažuriranja sesije ostaju, da admin vidi šta se desilo.
      if (!keepSessions) db.exec('DELETE FROM sessions');
      db.close();
      console.log(`Baza je vraćena iz: ${arg}`);
      console.log(`Prethodno stanje je sačuvano kao: ${safety.name}`);
      return 0;
    }
    case 'version':
      console.log(readVersion());
      return 0;
    default:
      console.log(help);
      return command ? 1 : 0;
  }
}

process.exit(run());
