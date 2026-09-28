// Zajednički kod za server i pregledač: bez zavisnosti, bez pristupa DOM-u i fajl sistemu.
// Proračun sečenja iz docs/prototip/radionica.html seli se ovde u fazi 3.

export { parseNumber, formatMm } from './units.js';
export {
  KINDS,
  KIND_LABELS,
  DEFAULT_CUTTING,
  computeProject,
  stockChanges,
  materialLabel,
  normProfile,
} from './krojenje.js';
