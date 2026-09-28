import { describe, expect, it } from 'vitest';
import { computeProject, materialLabel, stockChanges } from '../src/index.js';

const M = {
  cev4040: { id: 1, kind: 'metal', name: '40x40', thickness: 2 },
  cev4040t: { id: 2, kind: 'metal', name: '40x40', thickness: 1.5 },
  cev4020: { id: 3, kind: 'metal', name: '40x20', thickness: 1.5 },
  hrast: { id: 4, kind: 'iverica', name: 'Hrast lancelot', thickness: 18, hasGrain: true },
  bela: { id: 5, kind: 'iverica', name: 'Bela', thickness: 18, hasGrain: false },
  breza12: { id: 6, kind: 'sper', name: 'Breza', thickness: 12, hasGrain: true },
  bukva: { id: 7, kind: 'drvo', name: 'bukva' },
  hrastDrvo: { id: 8, kind: 'drvo', name: 'hrast' },
};
const materials = Object.values(M);
let id = 100;
const part = (kind, o) => ({ id: id++, kind, qty: 1, ...o });
const stock = (kind, o) => ({ id: id++, kind, qty: 1, ...o });

describe('metal', () => {
  it('raspoređuje delove po cevima istog materijala i javlja šta fali', () => {
    const parts = [
      part('metal', { name: 'Noga', materialId: 1, length: 712, qty: 4 }),
      part('metal', { name: 'Uzdužna', materialId: 1, length: 1320, qty: 2 }),
      part('metal', { name: 'Nosač', materialId: 3, length: 620, qty: 2 }),
    ];
    const st = [
      stock('metal', { materialId: 1, length: 3000 }),
      stock('metal', { materialId: 1, length: 2200 }),
      stock('metal', { materialId: 1, length: 800 }),
      stock('metal', { materialId: 3, length: 1100 }),
    ];
    const r = computeProject({ parts, stock: st, materials });
    expect(r.cats.metal.total).toBe(8);
    expect(r.cats.metal.placed).toBe(7);
    expect(r.cats.metal.miss.map((m) => m.name)).toEqual(['Nosač']);
    expect(r.buy.map((b) => b.text)).toContain('Cev 40x20, zid 1,5 mm: 1 komad po 6000 mm');
  });

  it('uračunava širinu reza: dva dela od 500 ne staju u 1002 mm sa rezom od 3', () => {
    const parts = [part('metal', { name: 'A', materialId: 1, length: 500, qty: 2 })];
    const r1 = computeProject({ parts, stock: [stock('metal', { materialId: 1, length: 1002 })], materials });
    expect(r1.cats.metal.placed).toBe(1);
    const r2 = computeProject({ parts, stock: [stock('metal', { materialId: 1, length: 1003 })], materials });
    expect(r2.cats.metal.placed).toBe(2);
  });

  it('„bilo koji zid“ uzima isti profil sa drugim zidom', () => {
    const st = [stock('metal', { materialId: 2, length: 1000 })];
    const strict = computeProject({
      parts: [part('metal', { materialId: 1, length: 600 })],
      stock: st,
      materials,
    });
    expect(strict.cats.metal.placed).toBe(0);
    const any = computeProject({
      parts: [part('metal', { materialId: 1, anyWall: true, length: 600 })],
      stock: st,
      materials,
    });
    expect(any.cats.metal.placed).toBe(1);
  });
});

describe('ploče', () => {
  it('deo koji prati dezen ne okreće se na ploči sa dezenom', () => {
    const parts = [part('iverica', { name: 'Polica', materialId: 4, length: 1000, width: 250, grain: true })];
    const poSirini = [stock('iverica', { materialId: 4, length: 1250, width: 900, grain: 'w' })];
    expect(computeProject({ parts, stock: poSirini, materials }).cats.iverica.placed).toBe(0);
    const poDuzini = [stock('iverica', { materialId: 4, length: 1250, width: 900, grain: 'l' })];
    expect(computeProject({ parts, stock: poDuzini, materials }).cats.iverica.placed).toBe(1);
  });

  it('na materijalu bez dezena delovi se slobodno okreću', () => {
    const parts = [part('iverica', { materialId: 5, length: 800, width: 300, grain: true })];
    const st = [stock('iverica', { materialId: 5, length: 400, width: 900, grain: 'l' })];
    expect(computeProject({ parts, stock: st, materials }).cats.iverica.placed).toBe(1);
  });

  it('ostaci iznad najmanje mere se vraćaju u lager', () => {
    const parts = [part('sper', { materialId: 6, length: 1200, width: 120, grain: true })];
    const st = [stock('sper', { materialId: 6, length: 1250, width: 600, grain: 'l' })];
    const r = computeProject({ parts, stock: st, materials });
    const sheet = r.cats.sper.groups[0].sheets[0];
    expect(sheet.offcuts.length).toBeGreaterThan(0);
    expect(sheet.offcuts[0].h).toBeGreaterThanOrEqual(100);
    const ch = stockChanges(r);
    expect(ch.take.get(st[0].id)).toBe(1);
    expect(ch.add.every((a) => a.kind === 'sper' && a.materialId === 6 && a.grain === 'l')).toBe(true);
  });
});

describe('drvo', () => {
  it('obrađen deo iz neobrađene grede dobija dodatak za rendisanje i napomenu', () => {
    const parts = [
      part('drvo', { name: 'Noga', materialId: 7, thickness: 40, width: 60, length: 700, planed: true }),
    ];
    const st = [stock('drvo', { materialId: 7, thickness: 50, width: 80, length: 2000, planed: false })];
    const r = computeProject({ parts, stock: st, materials });
    expect(r.cats.drvo.placed).toBe(1);
    expect(r.cats.drvo.bins[0].cuts[0].note).toBe('rendisati na 40×60');
    // 700 + 10 dodatka + 3 rez
    expect(r.cats.drvo.bins[0].rest).toBe(1287);
  });

  it('pogrešna vrsta drveta ili premali presek ne prolaze', () => {
    const parts = [part('drvo', { materialId: 8, thickness: 20, width: 30, length: 300, planed: true })];
    const st = [stock('drvo', { materialId: 7, thickness: 25, width: 150, length: 1800, planed: true })];
    expect(computeProject({ parts, stock: st, materials }).cats.drvo.placed).toBe(0);
    const tanak = [stock('drvo', { materialId: 8, thickness: 18, width: 150, length: 1800, planed: true })];
    expect(computeProject({ parts, stock: tanak, materials }).cats.drvo.placed).toBe(0);
  });
});

describe('nazivi', () => {
  it('prikazuje materijal sa merama', () => {
    expect(materialLabel(M.cev4040)).toBe('40x40, zid 2 mm');
    expect(materialLabel(M.hrast)).toBe('Hrast lancelot 18 mm');
    expect(materialLabel(M.bukva)).toBe('bukva');
  });
});
