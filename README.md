# Radionica

Aplikacija za kućnu radionicu koja radi na tvom Linux serveru, u kućnoj mreži.

- **Materijal**: lager cevi i profila, iverice, šperploče i drva, sa ostacima.
- **Projekti**: upišeš delove, a aplikacija kaže da li imaš materijal, kako da ga isečeš i šta da kupiš.
- **Inventar**: sve u radionici, sa lokacijama (regal, polica, kutija…) i QR nalepnicama.

Razvoj ide po fazama iz [docs/PLAN.md](docs/PLAN.md). Trenutna verzija ima šifarnik materijala, lager, projekte sa rasporedom sečenja i spiskom za kupovinu, korisnike, rezervne kopije i ažuriranje iz aplikacije. Inventar stiže u sledećoj fazi.

## Instalacija na server

Na Ubuntu serveru:

```
curl -fsSL https://raw.githubusercontent.com/krajcara/radionica/main/install.sh | sudo bash
```

Ako je repozitorijum na drugom GitHub nalogu, zameni `krajcara` u adresi i dodaj `REPO_OWNER`:

```
curl -fsSL https://raw.githubusercontent.com/NALOG/radionica/main/install.sh | sudo REPO_OWNER=NALOG bash
```

Na kraju se ispišu adresa i privremena lozinka za nalog `admin`. Pri prvoj prijavi biraš svoju lozinku.

| Putanja                                | Šta je                         |
| -------------------------------------- | ------------------------------ |
| `/opt/radionica`                       | aplikacija (git repozitorijum) |
| `/opt/radionica/.env`                  | port i adresa                  |
| `/opt/radionica/data/radionica.sqlite` | baza                           |
| `/opt/radionica/data/backups/`         | rezervne kopije                |

## Ažuriranje

U aplikaciji: Podešavanja › Ažuriranje › Proveri ažuriranja › Ažuriraj. Pre ažuriranja se pravi rezervna kopija baze, a ako nova verzija ne proradi, sama se vraća prethodna.

Ručno, na serveru: `sudo radionica update`

## Komande na serveru

| Komanda                        | Šta radi                               |
| ------------------------------ | -------------------------------------- |
| `sudo radionica update`        | ažurira sa GitHuba                     |
| `sudo radionica reset-admin`   | nova privremena lozinka za nalog admin |
| `sudo radionica backup`        | ručna rezervna kopija                  |
| `sudo radionica backups`       | spisak kopija                          |
| `sudo radionica restore <ime>` | vraća bazu iz kopije                   |
| `sudo radionica status`        | stanje servisa                         |
| `sudo radionica logs`          | poslednjih 100 linija dnevnika         |
| `sudo radionica restart`       | restart servisa                        |
| `sudo radionica version`       | verzija                                |

## Razvoj

Potreban je Node.js 22 ili noviji.

```
npm install
npm run dev
```

Server radi na `http://localhost:8080`, a prikaz sa automatskim osvežavanjem na `http://localhost:5173`. Podaci tokom razvoja su u fascikli `data/`. Pri prvom pokretanju server u konzoli ispiše privremenu lozinku za nalog `admin`.

Ostale komande:

| Komanda          | Šta radi                              |
| ---------------- | ------------------------------------- |
| `npm test`       | pokreće testove                       |
| `npm run lint`   | proverava kod                         |
| `npm run format` | sređuje formatiranje                  |
| `npm run build`  | gradi prikaz u `web/dist`             |
| `npm start`      | pokreće server sa izgrađenim prikazom |

## Nova verzija

Povećaj broj verzije u `package.json` fajlovima i pošalji izmene na `main`. Server ih vidi pod Podešavanja › Ažuriranje.

## Licenca

MIT, vidi [LICENSE](LICENSE).
