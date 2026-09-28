import { describe, expect, it } from 'vitest';
import { formatMm, parseNumber } from '../src/index.js';

describe('parseNumber', () => {
  it('prihvata decimalni zarez i tačku', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('12.5')).toBe(12.5);
  });
  it('prazan i neispravan unos daju 0', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber('abc')).toBe(0);
  });
});

describe('formatMm', () => {
  it('zaokružuje na jednu decimalu', () => {
    expect(formatMm(12.345)).toBe('12,3');
    expect(formatMm(700)).toBe('700');
  });
});
