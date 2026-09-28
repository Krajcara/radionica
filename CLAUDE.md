# Radionica

Aplikacija za kućnu radionicu: lager materijala, projekti sa rasporedom sečenja, inventar sa lokacijama. Radi na Ubuntu serveru u kućnoj mreži.

Sve odluke, faze i pravila proračuna su u `docs/PLAN.md`. Pročitaj ga pre rada i drži ga ažurnim kad se odluka promeni.

Radni prototip sa proračunom sečenja je u `docs/prototip/radionica.html`. Logiku iz njega prenesi u `shared/` sa testovima, ne piši je ispočetka.

## Pravila

- Interfejs je na srpskom, latinica. Kod, imena promenljivih i komentari mogu biti na engleskom.
- Izgled „Tehnički nacrt“: boje i uglovi samo preko promenljivih u `web/src/app.css`; tamna tema je podrazumevana.
- Repozitorijum je javan: nikad lozinke, tokeni, lični podaci ni pravi podaci iz radionice u repou.
- Instalacija i ažuriranje rade kao u InfraLoom-u: `install.sh`, `update.sh` i `radionica.service` u korenu repoa; servis radi kao root.
- Nova verzija = izmene na `main` i povećan broj verzije u svim `package.json` fajlovima.
- Svaka promena baze ide kroz numerisanu migraciju.
- Proračun u `shared/` je čist JavaScript bez zavisnosti i mora imati testove.
- Radi po fazama iz plana. Na kraju faze: testovi prolaze, README je ažuran, verzija je povećana.
- Zip sa izmenama sadrži samo nove i izmenjene fajlove, sa putanjama od korena repoa; obrisani fajlovi se navode posebno.
