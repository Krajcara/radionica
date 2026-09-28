const KEY = 'radionica-tema';

/** @returns {'sistem' | 'svetla' | 'tamna'} */
export function readTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'svetla' || t === 'tamna') return t;
  } catch {
    // Pregledač bez pristupa skladištu: prati sistem.
  }
  return 'sistem';
}

/** @param {'sistem' | 'svetla' | 'tamna'} theme */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'svetla') root.dataset.theme = 'light';
  else if (theme === 'tamna') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  try {
    if (theme === 'sistem') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Izbor važi do zatvaranja stranice.
  }
}
