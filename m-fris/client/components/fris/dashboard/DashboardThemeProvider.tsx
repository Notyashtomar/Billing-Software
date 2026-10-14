'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type DashboardThemePreference = 'light' | 'dark';

type DashboardThemeContextValue = {
  preference: DashboardThemePreference;
  setPreference: (p: DashboardThemePreference) => void;
  resolved: 'light' | 'dark';
  cyclePreference: () => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

const STORAGE_KEY = 'fris-dashboard-theme';
const LEGACY_STORAGE_KEY = 'fris-dashboard-bg-theme';

function readStoredTheme(): DashboardThemePreference {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === 'dark' || legacy === 'light') return legacy;
  } catch {
    /* ignore */
  }
  return 'light';
}

function applyTheme(theme: DashboardThemePreference) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<DashboardThemePreference>('light');
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    const theme = readStoredTheme();
    setPreferenceState(theme);
    applyTheme(theme);
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    applyTheme(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* ignore */
    }
  }, [preference, mounted]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue === 'light' || event.newValue === 'dark') {
        setPreferenceState(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** Strip dashboard dark class when leaving the dashboard route. */
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = '';
    };
  }, []);

  const setPreference = useCallback((p: DashboardThemePreference) => {
    setPreferenceState(p);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const resolved: 'light' | 'dark' = !mounted ? 'light' : preference;

  const value = useMemo(
    () => ({ preference, setPreference, resolved, cyclePreference }),
    [preference, setPreference, resolved, cyclePreference]
  );

  return <DashboardThemeContext.Provider value={value}>{children}</DashboardThemeContext.Provider>;
}

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    throw new Error('useDashboardTheme must be used within DashboardThemeProvider');
  }
  return ctx;
}
