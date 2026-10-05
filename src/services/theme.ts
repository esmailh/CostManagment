export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'expense-tracker:theme';

export function getTheme(): ThemeMode {
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
}

/** Resolve a mode to a concrete light/dark and stamp `data-theme` on <html>. */
export function applyTheme(mode: ThemeMode): void {
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}
