const KEY = 'radionica-tema';

/** Podrazumevana je tamna tema; „Sistem“ prati podešavanje uređaja. */
export function readTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'svetla' || t === 'tamna' || t === 'sistem') return t;
  } catch {
    // Pregledač bez pristupa skladištu.
  }
  return 'tamna';
}

/** @param {'sistem' | 'svetla' | 'tamna'} theme */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'svetla') root.dataset.theme = 'light';
  else if (theme === 'tamna') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Izbor važi do zatvaranja stranice.
  }
}
