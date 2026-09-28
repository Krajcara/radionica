export const fmt = (v) =>
  (Math.round(Number(v) * 10) / 10).toLocaleString('sr-Latn-RS', {
    maximumFractionDigits: 1,
    useGrouping: false,
  });

export function plural(count, one, few, many) {
  const m10 = count % 10;
  const m100 = count % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const HUES = [205, 32, 150, 350, 262, 90, 190, 15, 300, 55, 120, 230];
export const partColor = (i) => `hsl(${HUES[i % HUES.length]} 45% 74%)`;

export const DOTS = { metal: 'metal', iverica: 'iverica', sper: 'sper', drvo: 'drvo' };

export function countPieces(rows) {
  return rows.reduce((a, r) => a + Math.max(0, Math.floor(Number(r.qty) || 0)), 0);
}

/** „Sva 3 dela mogu…“ sa ispravnim oblikom. */
export function allCut(count) {
  if (count === 1) return 'Jedini deo može da se iseče iz lagera.';
  const m10 = count % 10;
  const m100 = count % 100;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14))
    return `Sva ${count} dela mogu da se iseku iz lagera.`;
  return `Svih ${count} delova može da se iseče iz lagera.`;
}
