# Radionica: plan projekta

Radionica je aplikacija za kućnu radionicu koja radi na sopstvenom Linux serveru. Vodi lager materijala (metal, iverica, šperploča, drvo), pravi raspored sečenja za projekte iz onoga što već imaš, pravi spisak za kupovinu za ono što fali, i vodi inventar svega u radionici sa lokacijama i QR nalepnicama.

Ovaj dokument je izvor istine za odluke. Kad se odluka promeni, menja se i ovde.

## Dogovorene odluke

| Tema             | Odluka                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Ime              | `radionica`                                                                                                                             |
| Repozitorijum    | javni GitHub repo; nikad lozinke, ključevi ni lični podaci u repou                                                                      |
| Server           | Ubuntu (LTS), jedan server u kućnoj mreži                                                                                               |
| Pristup          | samo iz kućne mreže, HTTP na portu 8080 (podesivo u `.env`); HTTPS je opcija za kasnije                                                 |
| Backend          | Node.js 22 (najmanje 22.16), Fastify                                                                                                    |
| Baza             | SQLite preko ugrađenog `node:sqlite` (bez prevođenja na serveru), jedan fajl u `/opt/radionica/data/`                                   |
| Frontend         | Svelte + Vite, gradi se u statičke fajlove koje servira backend                                                                         |
| Telefon          | responzivan prikaz i PWA (ikonica na početnom ekranu)                                                                                   |
| Tema             | svetla i tamna; podrazumevano prati sistem, uz ručni izbor                                                                              |
| Jezik interfejsa | srpski, latinica                                                                                                                        |
| Pokretanje       | kao InfraLoom: git clone u `/opt/radionica`, izgradnja na serveru, systemd servis kao root (zbog ažuriranja iz aplikacije), bez Dockera |
| Jedinice         | milimetri svuda, osim kant trake i dužina u pregledima (metri)                                                                          |
| Licenca          | MIT                                                                                                                                     |

## Struktura repozitorijuma

```
radionica/
  server/        Node.js backend (API, baza, prijava, ažuriranje)
  web/           Svelte frontend
  shared/        čisti JavaScript bez zavisnosti: proračun sečenja, validacija
  bin/           komanda radionica za server
  install.sh     instalacija (po uzoru na InfraLoom)
  update.sh      ažuriranje sa grane main
  radionica.service  systemd servis
  docs/          PLAN.md, prototip/, uputstva
  CLAUDE.md
  README.md
  LICENSE
```

Proračun sečenja živi u `shared/` jer mora da radi i u pregledaču (trenutni prikaz dok korisnik kuca) i na serveru (skidanje sa lagera). Ima svoje testove.

## Instalacija

Po uzoru na InfraLoom (projekat Krajcara Admin). Jedna komanda na serveru:

```
curl -fsSL https://raw.githubusercontent.com/krajcara/radionica/main/install.sh | sudo bash
```

Skripta:

1. Instalira sistemske pakete (curl, git, sqlite3).
2. Instalira Node.js 22 preko nvm ako nema bar 22.16.
3. Klonira repozitorijum u `/opt/radionica`, ili povuče najnoviji kod ako već postoji.
4. Pravi `.env` iz `.env.example` (port, adresa), ako ne postoji.
5. `npm ci --include=dev` i `npm run build` na samom serveru.
6. Priprema bazu u `/opt/radionica/data` i pravi nalog `admin` sa privremenom lozinkom.
7. Instalira komandu `radionica` i systemd servis, pokreće ga i čeka `/api/health`.
8. Ispisuje adresu, korisnika i privremenu lozinku.

Pri prvoj prijavi admin mora da promeni lozinku. Ponovno pokretanje skripte ne dira `.env` ni podatke. `sudo radionica reset-admin` daje novu privremenu lozinku.

## Ažuriranje iz aplikacije

Po uzoru na InfraLoom, bez GitHub izdanja: prati se grana `main`.

1. Admin u Podešavanjima klikne „Proveri ažuriranja“. Server uradi `git fetch` i poredi svoj commit sa `origin/main`, pa prikaže novu verziju iz `package.json` i spisak commit poruka.
2. „Ažuriraj“ pokreće `update.sh` preko `systemd-run`, kao posebnu jedinicu, da skripta preživi restart servisa (bez systemd-run pokreće se direktno).
3. `update.sh` upisuje korak u `data/update-progress.json`, a prikaz ga čita svake 2 sekunde: rezervna kopija baze, `git reset --hard origin/main`, `npm ci`, izgradnja prikaza, migracije, restart, provera `/api/health`.
4. Ako izgradnja ne uspe ili server ne proradi, skripta vraća prethodni commit i bazu iz kopije napravljene pre ažuriranja, i prijavljuje grešku.
5. Isto se radi ručno: `sudo radionica update`.

Nova verzija se objavljuje tako što se izmene pošalju na `main`, uz povećan broj verzije u `package.json`.

## Korisnici i bezbednost

Uloge: `admin` (sve, uključujući korisnike i ažuriranje), `korisnik` (menja podatke), `gost` (samo gleda). Lozinke se čuvaju kao scrypt heš (ugrađen u Node.js). Servis radi kao root, kao InfraLoom, da bi mogao sam da se ažurira; aplikacija je samo u kućnoj mreži. Sesija je u kolačiću koji je httpOnly. Ograničen je broj pogrešnih prijava.

## Rezervne kopije

Svaki dan u zadato vreme kopija baze i slika u `/opt/radionica/data/backups/`, uz čuvanje poslednjih N kopija. Admin može ručno da napravi kopiju, preuzme je i vrati. Postoji i izvoz i uvoz svih podataka u JSON.

## Model podataka (pregled)

- **Šifarnik materijala**: profili (oblik, mere, debljina zida), iverice (dekor, debljina, da li ima dezen), šperploče (debljina, vrsta), vrste drveta, kant trake (dekor, debljina, širina).
- **Lager materijala**: komadi iz šifarnika sa merama i količinom. Iverica i šperploča imaju smer dezena ili žice (po dužini, po širini, nije bitno), a kasnije i kantovane ivice. Drvo ima presek, dužinu i da li je obrađeno. Kant traka se vodi u metrima.
- **Projekti**: naziv, delovi po vrsti materijala, način sečenja za iverice i šperploče (testera, testera pa ubodna, CNC), status i datum završetka, snimak lagera pre završetka (radi poništavanja).
- **Inventar**: lokacije kao stablo proizvoljne dubine (tip: regal, polica, kutija, fiokar, fioka, ormar, zid…; kratka oznaka kao A-2-4), kategorije koje korisnik pravi, stvari (naziv, kategorija, lokacija, količina, jedinica, minimum za potrošni materijal, slike, napomena, sistem baterija za alat na baterije), pozajmice (kome, od kada, vraćeno).

## Pravila proračuna (preneti iz prototipa u `docs/prototip/`)

- Širina reza testere se uračunava između delova. Poslednji deo može da završi tačno na kraju komada.
- **Metal i drvo (1D)**: pakovanje po najboljem uklapanju, više strategija, bira se ona koja smesti najviše, pa troši najmanje. Metal: profil mora da se poklopi, zid takođe ako je upisan na delu. Drvo: vrsta ako je upisana; presek komada mora da bude veći ili jednak preseku dela; ako je deo obrađen, a komad nije, dodaje se dodatak za rendisanje po strani; dodatak na dužinu za poravnanje čela. Uz deo iz većeg preseka piše se napomena „obraditi na …“.
- **Ploče (2D)**: gilotinski rezovi (svaki rez od ivice do ivice), više heuristika, bira se najbolja. Deo koji prati dezen ili žicu ne okreće se na ploči koja ima dezen; na ploči bez dezena delovi se slobodno okreću. Obrub oštećenih ivica je podesiv. Ostaci iznad najmanje mere se vraćaju u lager.
- **Kupovina**: delovi koji ne staju pakuju se u standardne mere iz podešavanja (cev 6 m, iverica 2800 × 2070, šperploča 2500 × 1250, drvo 4 m).
- **Završetak projekta**: iskorišćeni komadi se skidaju sa lagera, upotrebljivi ostaci dodaju, a snimak lagera pre toga se čuva za poništavanje.

## Faze

Svaka faza se završava izdanjem koje se instalira na server i proba na pravom poslu pre sledeće faze.

**Faza 0: temelj repozitorijuma (gotovo, v0.1.0).** Struktura fascikli, README na srpskom, licenca, podešavanje alata (ESLint, Prettier, Vitest), GitHub Actions za testove. Prazan backend sa `/api/health` i prazan frontend sa svetlom i tamnom temom.

**Faza 1: instalacija, prijava, korisnici, rezervne kopije (gotovo, v0.2.0).** `install.sh`, systemd servis, admin sa privremenom lozinkom i obaveznom promenom, `reset-admin`, uloge i upravljanje korisnicima, dnevne rezervne kopije sa vraćanjem, izvoz JSON-a. Uvoz JSON-a prelazi u fazu 3, kad bude podataka za uvoz.

**Faza 2: instalacija i ažuriranje po uzoru na InfraLoom (gotovo, v0.3.0).** Instalacija iz git repozitorijuma, ažuriranje iz aplikacije sa prikazom izmena i napretka, rezervna kopija pre ažuriranja, vraćanje prethodne verzije i baze ako nova ne proradi.

**Faza 3: materijal i projekti.** Šifarnik, lager, projekti, raspored sečenja i spisak za kupovinu, kao u prototipu, uz izbor sa liste umesto kucanja. Uvoz podataka iz prototipa.

**Faza 4: inventar.** Lokacije, kategorije, stvari sa slikama, pretraga, potrošni materijal sa minimumom (ulazi u spisak za kupovinu), pozajmice, QR nalepnice sa kratkom oznakom (QR vodi na `http://<server>/l/<oznaka>`), štampa na A4 i na etikete, brzo dodavanje sa telefona.

**Faza 5: kantovanje.** Ivice za kantovanje na delovima, već kantovane ivice na pločama u lageru, postavljanje dela uz kantovanu ivicu ploče, obrub ne seče kantovane ivice, metri trake po vrsti, odbitak debljine trake od mere za sečenje, kant traka u lageru.

**Faza 6: uglovi.** Ugao na svakom kraju cevi i drvenog dela, strana preko koje ide rez, dužina merena po dužoj ivici, zajednički kosi rezovi između susednih delova.

**Faza 7: oblici za testeru i ubodnu testeru.** Biblioteka oblika (trougao, trapez, krug, elipsa, pravilni mnogougao, zvezda, L-oblik, slobodan oblik po tačkama), crtanje na rasporedu, pravougaonik oko oblika, sparivanje oblika, razmak za ubodnu testeru, kant po ivicama oblika.

**Faza 8: CNC.** Slobodno slaganje oblika, prečnik glodala i razmak, rub za stezanje, radni prostor mašine sa predsecanjem ploče testerom, upozorenje za unutrašnje uglove, izvoz DXF i SVG.

**Faza 9: povezivanje i dodaci.** Okov i potrošni materijal iz inventara u projektima, alat po projektu sa lokacijom, šabloni (fioka, ram stola), troškovi, štampa krojne liste.

## Otvorena pitanja

- Da li server ima fiksnu IP adresu u kućnoj mreži (potrebno zbog QR nalepnica).
- Rezervisanje materijala između više otvorenih projekata (za fazu 3 ili kasnije).
