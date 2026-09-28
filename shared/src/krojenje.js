// Proračun sečenja: iz lagera bira komade za delove projekta.
// Preneto iz docs/prototip/radionica.html. Čist JavaScript, radi u pregledaču i na serveru.
// Sve mere su u milimetrima.

export const KINDS = ['metal', 'iverica', 'sper', 'drvo'];
export const KIND_LABELS = { metal: 'Metal', iverica: 'Iverica', sper: 'Šperploča', drvo: 'Drvo' };

export const DEFAULT_CUTTING = {
  kerfMetal: 3,
  minMetal: 150,
  kerfBoard: 4,
  trim: 0,
  minBoard: 100,
  kerfWood: 3,
  planeAllow: 3,
  lenAllow: 10,
  minWood: 200,
  buyMetal: 6000,
  buyIvL: 2800,
  buyIvW: 2070,
  buySpL: 2500,
  buySpW: 1250,
  buyWood: 4000,
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) =>
  (Math.round(v * 10) / 10).toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1, useGrouping: false });
const lexLess = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - 1e-9) return true;
    if (a[i] > b[i] + 1e-9) return false;
  }
  return false;
};
const plural = (count, one, few, many) => {
  const m10 = count % 10;
  const m100 = count % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const normProfile = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/\s+/g, '');

/** Naziv materijala za prikaz. */
export function materialLabel(m) {
  if (!m) return 'nepoznat materijal';
  if (!String(m.name || '').trim()) m = { ...m, name: 'bez naziva' };
  if (m.kind === 'metal') return `${m.name}${n(m.thickness) ? `, zid ${fmt(n(m.thickness))} mm` : ''}`;
  if (m.kind === 'iverica' || m.kind === 'sper') return `${m.name} ${fmt(n(m.thickness))} mm`;
  return m.name;
}

function expand(rows, fn) {
  const out = [];
  rows.forEach((r, ci) => {
    const q = Math.floor(n(r.qty));
    const o = fn(r, ci);
    if (!o || !(q > 0)) return;
    for (let j = 0; j < q; j++) out.push({ ...o });
  });
  return out;
}

/* ---------------- 1D: cevi i drvo ---------------- */

function pack1D(items, binsIn, k, compat, mode) {
  const bins = binsIn.map((b) => ({ ...b, rem: b.L + k, cuts: [] }));
  const sorted = [...items].sort(
    mode === 2 ? (a, b) => (b.cross || 0) - (a.cross || 0) || b.len - a.len : (a, b) => b.len - a.len,
  );
  const miss = [];
  let excess = 0;
  for (const it of sorted) {
    const need = it.len + k;
    let best = null;
    let bs = null;
    let bex = 0;
    for (const b of bins) {
      if (b.rem < need - 1e-9) continue;
      const ex = compat(it, b);
      if (ex === null) continue;
      const fresh = b.cuts.length ? 0 : 1;
      const tail = fresh ? b.L : b.rem - need;
      const score = mode === 1 ? [ex, b.rem - need] : mode === 2 ? [ex, fresh, tail] : [fresh, ex, tail];
      if (!best || lexLess(score, bs)) {
        best = b;
        bs = score;
        bex = ex;
      }
    }
    if (best) {
      best.cuts.push(it);
      best.rem -= need;
      excess += bex * it.len;
    } else miss.push(it);
  }
  const used = bins.filter((b) => b.cuts.length);
  return {
    bins,
    miss,
    placed: items.length - miss.length,
    placedLen: sorted.filter((i) => !miss.includes(i)).reduce((a, b) => a + b.len, 0),
    usedLen: used.reduce((a, b) => a + b.L, 0),
    excess,
  };
}

function best1D(items, bins, k, compat) {
  let best = null;
  for (const mode of [0, 1, 2]) {
    const r = pack1D(items, bins, k, compat, mode);
    if (!best || lexLess([-r.placedLen, r.excess, r.usedLen], [-best.placedLen, best.excess, best.usedLen]))
      best = r;
  }
  return best;
}

function buyBars(miss, buyL, k, keyFn, labelFn) {
  const out = [];
  const groups = new Map();
  for (const m of miss) {
    const key = keyFn(m);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  for (const list of groups.values()) {
    const fits = list.filter((m) => m.len <= buyL);
    if (fits.length) {
      const r = pack1D(
        fits,
        fits.map(() => ({ L: buyL })),
        k,
        () => 0,
        0,
      );
      const count = r.bins.filter((b) => b.cuts.length).length;
      out.push(
        `${labelFn(list[0])}: ${count} ${plural(count, 'komad', 'komada', 'komada')} po ${fmt(buyL)} mm`,
      );
    }
    for (const m of list.filter((x) => x.len > buyL)) {
      out.push(`${labelFn(m)}: ${m.name} ${fmt(m.real)} mm je duži od ${fmt(buyL)} mm, kupi po meri`);
    }
  }
  return out;
}

function finish1D(res, k, minRest, cutNote, missText) {
  const bins = res.bins
    .filter((b) => b.cuts.length)
    .sort((a, b) => a.group.localeCompare(b.group) || b.L - a.L)
    .map((b) => {
      const rest = Math.max(0, b.rem - k);
      return {
        stockId: b.stockId,
        L: b.L,
        group: b.group,
        rest,
        returnsToStock: rest > 0 && rest >= minRest,
        cuts: b.cuts.map((c) => ({
          partId: c.partId,
          name: c.name,
          len: c.len,
          real: c.real,
          ci: c.ci,
          note: cutNote(c, b),
        })),
        leftover: b.leftover,
      };
    });
  return {
    k,
    placed: res.placed,
    total: res.placed + res.miss.length,
    bins,
    unused: res.bins
      .filter((b) => !b.cuts.length)
      .map((b) => ({ stockId: b.stockId, L: b.L, group: b.group })),
    miss: res.miss.map((m) => ({ partId: m.partId, name: m.name, text: missText(m) })),
  };
}

function computeMetal(parts, stock, matById, S) {
  const k = Math.max(0, n(S.kerfMetal));
  const items = expand(parts, (r, ci) => {
    const L = n(r.length);
    const m = matById.get(r.materialId);
    if (!(L > 0) || !m) return null;
    return {
      partId: r.id,
      name: (r.name || '').trim() || 'Deo',
      len: L,
      real: L,
      ci,
      materialId: m.id,
      profile: normProfile(m.name),
      anyWall: Boolean(r.anyWall),
      label: r.anyWall ? `${m.name}, bilo koji zid` : materialLabel(m),
    };
  });
  const bins = expand(stock, (r) => {
    const L = n(r.length);
    const m = matById.get(r.materialId);
    if (!(L > 0) || !m) return null;
    return {
      stockId: r.id,
      L,
      materialId: m.id,
      profile: normProfile(m.name),
      group: materialLabel(m),
      leftover: { kind: 'metal', materialId: m.id },
    };
  });
  const res = best1D(items, bins, k, (it, b) =>
    it.materialId === b.materialId || (it.anyWall && it.profile === b.profile) ? 0 : null,
  );
  const out = finish1D(
    res,
    k,
    n(S.minMetal),
    () => '',
    (m) => `${m.name}, ${fmt(m.real)} mm, ${m.label}`,
  );
  out.buy = buyBars(
    res.miss,
    n(S.buyMetal) || 6000,
    k,
    (m) => (m.anyWall ? 'p:' + m.profile : 'm:' + m.materialId),
    (m) => `Cev ${m.label}`,
  );
  return out;
}

function computeWood(parts, stock, matById, S) {
  const k = Math.max(0, n(S.kerfWood));
  const allow = Math.max(0, n(S.planeAllow));
  const lenAllow = Math.max(0, n(S.lenAllow));
  const items = expand(parts, (r, ci) => {
    const L = n(r.length);
    const t = n(r.thickness);
    const w = n(r.width);
    if (!(L > 0 && t > 0 && w > 0)) return null;
    const m = r.materialId ? matById.get(r.materialId) : null;
    return {
      partId: r.id,
      name: (r.name || '').trim() || 'Deo',
      len: L + lenAllow,
      real: L,
      ci,
      t,
      w,
      a: Math.min(t, w),
      b: Math.max(t, w),
      cross: t * w,
      materialId: m ? m.id : null,
      species: m ? m.name : 'bilo koje drvo',
      planed: Boolean(r.planed),
    };
  });
  const bins = expand(stock, (r) => {
    const L = n(r.length);
    const t = n(r.thickness);
    const w = n(r.width);
    const m = matById.get(r.materialId);
    if (!(L > 0 && t > 0 && w > 0) || !m) return null;
    return {
      stockId: r.id,
      L,
      t,
      w,
      sa: Math.min(t, w),
      sb: Math.max(t, w),
      materialId: m.id,
      planed: Boolean(r.planed),
      group: `${m.name} ${fmt(t)}×${fmt(w)}, ${r.planed ? 'obrađeno' : 'neobrađeno'}`,
      leftover: { kind: 'drvo', materialId: m.id, thickness: t, width: w, planed: Boolean(r.planed) },
    };
  });
  const compat = (it, b) => {
    if (it.materialId && it.materialId !== b.materialId) return null;
    let pa = it.a;
    let pb = it.b;
    if (it.planed && !b.planed) {
      pa += 2 * allow;
      pb += 2 * allow;
    }
    return b.sa >= pa - 1e-9 && b.sb >= pb - 1e-9 ? b.sa * b.sb - it.a * it.b : null;
  };
  const res = best1D(items, bins, k, compat);
  const cutNote = (c, b) => {
    const bigger = b.sa > c.a + 1e-9 || b.sb > c.b + 1e-9;
    if (c.planed && !b.planed) return `rendisati na ${fmt(c.t)}×${fmt(c.w)}`;
    if (bigger) return `${c.planed ? 'obraditi' : 'iseći'} na ${fmt(c.t)}×${fmt(c.w)}`;
    return '';
  };
  const label = (m) => `${m.species} ${fmt(m.t)}×${fmt(m.w)}, ${m.planed ? 'obrađeno' : 'neobrađeno'}`;
  const out = finish1D(res, k, n(S.minWood), cutNote, (m) => `${m.name}, ${fmt(m.real)} mm, ${label(m)}`);
  out.lenAllow = lenAllow;
  out.buy = buyBars(
    res.miss,
    n(S.buyWood) || 4000,
    k,
    (m) => `${m.materialId}|${m.a}|${m.b}|${m.planed}`,
    (m) => label(m).replace(/^./, (c) => c.toUpperCase()),
  );
  return out;
}

/* ---------------- 2D: ploče, samo rezovi od ivice do ivice ---------------- */

function orients(it, sh) {
  if (it.l === it.w) return [false];
  if (!it.grain || sh.grain === 'none') return [false, true];
  return [sh.grain === 'w'];
}

function pack2D(items, sheets, k, trim, sortFn, split, choose) {
  const S = sheets.map((s) => {
    const uw = s.L - 2 * trim + k;
    const uh = s.W - 2 * trim + k;
    return { ...s, free: uw > k && uh > k ? [{ x: 0, y: 0, w: uw, h: uh }] : [], placed: [] };
  });
  const its = [...items].sort(sortFn);
  const miss = [];
  for (const it of its) {
    const pw = it.l + k;
    const ph = it.w + k;
    let best = null;
    const trySheet = (sh) => {
      const opts = orients(it, sh);
      sh.free.forEach((f, fi) => {
        for (const rot of opts) {
          const w = rot ? ph : pw;
          const h = rot ? pw : ph;
          if (w <= f.w + 1e-9 && h <= f.h + 1e-9) {
            const area = f.w * f.h - w * h;
            const side = Math.min(f.w - w, f.h - h);
            const s1 = choose === 'baf' ? area : side;
            const s2 = choose === 'baf' ? side : area;
            if (!best || s1 < best.s1 - 1e-9 || (Math.abs(s1 - best.s1) < 1e-9 && s2 < best.s2)) {
              best = { sh, fi, w, h, rot, s1, s2 };
            }
          }
        }
      });
    };
    S.filter((s) => s.placed.length).forEach(trySheet);
    if (!best) {
      for (const s of S.filter((x) => !x.placed.length).sort((a, b) => a.L * a.W - b.L * b.W)) {
        trySheet(s);
        if (best) break;
      }
    }
    if (!best) {
      miss.push(it);
      continue;
    }
    const { sh, fi, w, h, rot } = best;
    const f = sh.free[fi];
    sh.free.splice(fi, 1);
    sh.placed.push({ x: f.x, y: f.y, w: w - k, h: h - k, rot, it });
    const rw = f.w - w;
    const rh = f.h - h;
    const add = (r) => {
      if (r.w > k + 1e-9 && r.h > k + 1e-9) sh.free.push(r);
    };
    const horiz = split === 'short' ? rw < rh : rw >= rh;
    if (horiz) {
      add({ x: f.x, y: f.y + h, w: f.w, h: rh });
      add({ x: f.x + w, y: f.y, w: rw, h });
    } else {
      add({ x: f.x + w, y: f.y, w: rw, h: f.h });
      add({ x: f.x, y: f.y + h, w, h: rh });
    }
  }
  const used = S.filter((s) => s.placed.length);
  let bigOff = 0;
  used.forEach((s) =>
    s.free.forEach((f) => {
      bigOff = Math.max(bigOff, (f.w - k) * (f.h - k));
    }),
  );
  return {
    S,
    miss,
    placed: items.length - miss.length,
    placedArea: its.filter((i) => !miss.includes(i)).reduce((a, b) => a + b.l * b.w, 0),
    usedArea: used.reduce((a, s) => a + s.L * s.W, 0),
    bigOff,
  };
}

const SORTS = [
  (a, b) => b.l * b.w - a.l * a.w,
  (a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w) || b.l * b.w - a.l * a.w,
  (a, b) => b.l + b.w - (a.l + a.w),
  (a, b) => b.l - a.l || b.w - a.w,
  (a, b) => b.w - a.w || b.l - a.l,
  (a, b) => (b.grain ? 1 : 0) - (a.grain ? 1 : 0) || b.l * b.w - a.l * a.w,
];

function best2D(items, sheets, k, trim) {
  let best = null;
  for (const sf of SORTS) {
    for (const split of ['short', 'long']) {
      for (const choose of ['baf', 'bssf']) {
        const r = pack2D(items, sheets, k, trim, sf, split, choose);
        if (
          !best ||
          lexLess(
            [-r.placedArea, -r.placed, r.usedArea, -r.bigOff],
            [-best.placedArea, -best.placed, best.usedArea, -best.bigOff],
          )
        ) {
          best = r;
        }
      }
    }
  }
  return best;
}

function computeSheets(kind, parts, stock, matById, S) {
  const k = Math.max(0, n(S.kerfBoard));
  const trim = Math.max(0, n(S.trim));
  const minOff = n(S.minBoard);
  const buyL = n(kind === 'iverica' ? S.buyIvL : S.buySpL) || 2800;
  const buyW = n(kind === 'iverica' ? S.buyIvW : S.buySpW) || 2070;
  const word = kind === 'iverica' ? 'Iverica' : 'Šperploča';
  const groups = new Map();
  const g = (m) => {
    if (!groups.has(m.id)) groups.set(m.id, { material: m, items: [], sheets: [] });
    return groups.get(m.id);
  };
  parts.forEach((r, ci) => {
    const l = n(r.length);
    const w = n(r.width);
    const q = Math.floor(n(r.qty));
    const m = matById.get(r.materialId);
    if (!m || !(l > 0 && w > 0 && q > 0)) return;
    for (let j = 0; j < q; j++) {
      g(m).items.push({
        partId: r.id,
        name: (r.name || '').trim() || 'Deo',
        l,
        w,
        grain: Boolean(r.grain),
        ci,
      });
    }
  });
  stock.forEach((r) => {
    const l = n(r.length);
    const w = n(r.width);
    const q = Math.floor(n(r.qty));
    const m = matById.get(r.materialId);
    if (!m || !(l > 0 && w > 0 && q > 0)) return;
    const grain = m.hasGrain ? r.grain || 'none' : 'none';
    for (let j = 0; j < q; j++) g(m).sheets.push({ stockId: r.id, L: l, W: w, grain });
  });
  const out = { k, trim, placed: 0, total: 0, groups: [], miss: [], buy: [] };
  for (const grp of groups.values()) {
    if (!grp.items.length) continue;
    const label = materialLabel(grp.material);
    out.total += grp.items.length;
    const res = best2D(grp.items, grp.sheets, k, trim);
    out.placed += res.placed;
    const sheets = res.S.filter((s) => s.placed.length).map((s) => {
      const offcuts = s.free
        .map((f) => ({ x: trim + f.x, y: trim + f.y, w: f.w - k, h: f.h - k }))
        .filter((o) => o.w >= minOff && o.h >= minOff)
        .sort((a, b) => b.w * b.h - a.w * a.h);
      const area = s.placed.reduce((a, p) => a + p.w * p.h, 0);
      return {
        stockId: s.stockId,
        L: s.L,
        W: s.W,
        grain: s.grain,
        usedPct: Math.round((area / (s.L * s.W)) * 100),
        parts: s.placed.map((p) => ({
          x: trim + p.x,
          y: trim + p.y,
          w: p.w,
          h: p.h,
          rot: p.rot,
          partId: p.it.partId,
          name: p.it.name,
          l: p.it.l,
          lw: p.it.w,
          grain: p.it.grain && s.grain !== 'none',
          ci: p.it.ci,
        })),
        offcuts,
        leftover: { kind, materialId: grp.material.id, grain: s.grain },
      };
    });
    out.groups.push({ materialId: grp.material.id, label, noStock: !grp.sheets.length, sheets });
    for (const m of res.miss) {
      out.miss.push({
        partId: m.partId,
        name: m.name,
        text: `${m.name}, ${fmt(m.l)} × ${fmt(m.w)} mm, ${label}`,
      });
    }
    if (res.miss.length) {
      const r2 = best2D(
        res.miss,
        res.miss.map(() => ({ L: buyL, W: buyW, grain: 'l' })),
        k,
        trim,
      );
      const used = r2.S.filter((s) => s.placed.length);
      if (used.length) {
        const pct = Math.round((r2.placedArea / used.reduce((a, s) => a + s.L * s.W, 0)) * 100);
        out.buy.push(
          `${word} ${label}: ${used.length} ${plural(used.length, 'ploča', 'ploče', 'ploča')} ${fmt(buyL)} × ${fmt(buyW)} mm (iskoristi se oko ${pct}%, pa pitaj i za krojenje ili manji komad)`,
        );
      }
      for (const m of r2.miss) {
        out.buy.push(
          `${word} ${label}: ${m.name} ${fmt(m.l)} × ${fmt(m.w)} mm je veći od standardne ploče, kupi po meri`,
        );
      }
    }
  }
  return out;
}

/**
 * Računa raspored za ceo projekat.
 * @param {{ parts: object[], stock: object[], materials: object[], settings?: object }} input
 */
export function computeProject({ parts, stock, materials, settings }) {
  const S = { ...DEFAULT_CUTTING, ...(settings || {}) };
  const matById = new Map(materials.map((m) => [m.id, m]));
  const by = (rows, kind) => rows.filter((r) => r.kind === kind);
  const cats = {
    metal: computeMetal(by(parts, 'metal'), by(stock, 'metal'), matById, S),
    iverica: computeSheets('iverica', by(parts, 'iverica'), by(stock, 'iverica'), matById, S),
    sper: computeSheets('sper', by(parts, 'sper'), by(stock, 'sper'), matById, S),
    drvo: computeWood(by(parts, 'drvo'), by(stock, 'drvo'), matById, S),
  };
  let placed = 0;
  let total = 0;
  const buy = [];
  for (const kind of KINDS) {
    placed += cats[kind].placed;
    total += cats[kind].total;
    for (const text of cats[kind].buy) buy.push({ kind, text });
  }
  return { cats, placed, total, buy, settings: S };
}

/**
 * Šta se menja u lageru kad se projekat završi: koliko komada se skida sa kog reda
 * i koji ostaci se vraćaju.
 */
export function stockChanges(result) {
  const take = new Map();
  const add = [];
  const dec = (id) => take.set(id, (take.get(id) || 0) + 1);
  for (const kind of ['metal', 'drvo']) {
    for (const b of result.cats[kind].bins) {
      dec(b.stockId);
      if (b.returnsToStock) add.push({ ...b.leftover, length: Math.floor(b.rest) });
    }
  }
  for (const kind of ['iverica', 'sper']) {
    for (const g of result.cats[kind].groups) {
      for (const s of g.sheets) {
        dec(s.stockId);
        for (const o of s.offcuts) {
          add.push({ ...s.leftover, length: Math.floor(o.w), width: Math.floor(o.h) });
        }
      }
    }
  }
  return { take, add };
}
