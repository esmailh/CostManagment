import { useEffect, useState } from 'react';
import { applyTheme, getTheme, setTheme as persistTheme, type ThemeMode } from '../services/theme';

export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(getTheme);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // Re-resolve when the OS scheme changes while in "system" mode.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const set = (next: ThemeMode) => {
    persistTheme(next);
    setMode(next);
  };

  return [mode, set];
}
