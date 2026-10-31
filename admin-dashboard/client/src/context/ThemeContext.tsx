import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  preference: ThemePreference;
  isDark: boolean;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const isDark = preference === 'dark' || (preference === 'system' && systemDark);

  useEffect(() => {
    // Flowbite's provider applies its own stored mode to <html>, so keep it in agreement.
    localStorage.setItem('flowbite-theme-mode', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0f172a' : '#ffffff');
  }, [isDark]);

  const setPreference = useCallback((p: ThemePreference) => {
    if (p === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, p);
    setPreferenceState(p);
  }, []);

  const toggle = useCallback(() => setPreference(isDark ? 'light' : 'dark'), [isDark, setPreference]);

  return (
    <ThemeContext.Provider value={{ preference, isDark, setPreference, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
