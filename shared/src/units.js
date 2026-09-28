/**
 * Pretvara unos korisnika u broj. Prihvata decimalni zarez i tačku.
 * Prazan ili neispravan unos daje 0.
 * @param {unknown} value
 * @returns {number}
 */
export function parseNumber(value) {
  const n = Number.parseFloat(
    String(value ?? '')
      .trim()
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formatira milimetre za prikaz: najviše jedna decimala, srpski zapis.
 * @param {number} mm
 * @returns {string}
 */
export function formatMm(mm) {
  const rounded = Math.round(mm * 10) / 10;
  return rounded.toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1, useGrouping: false });
}
