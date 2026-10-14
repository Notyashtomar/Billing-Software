'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AdminPanelTheme = {
  page: string;
  sidebar: string;
  panel: string;
  muted: string;
  tabBase: string;
  tabActive: string;
  accentA: string;
  accentB: string;
  accentC: string;
  cardGlow: string;
};

type AdminPanelContextValue = {
  isDark: boolean;
  setIsDark: (value: boolean) => void;
  theme: AdminPanelTheme;
};

const AdminPanelContext = createContext<AdminPanelContextValue | null>(null);

const ADMIN_THEME_STORAGE_KEY = 'fris-admin-panel-theme';

function readStoredAdminTheme(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
  } catch {
    // ignore storage errors
  }
  return true;
}

function writeStoredAdminTheme(isDark: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    // ignore storage errors
  }
}

export function AdminPanelProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDarkState] = useState(() => readStoredAdminTheme());

  const setIsDark = useCallback((next: boolean) => {
    setIsDarkState(next);
    writeStoredAdminTheme(next);
  }, []);

  const theme = useMemo<AdminPanelTheme>(
    () =>
      isDark
        ? {
            page: 'bg-[#07090f] text-slate-100',
            sidebar:
              'bg-white/5 border-white/10 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.55)]',
            panel:
              'bg-white/[0.04] border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]',
            muted: 'text-slate-300/80',
            tabBase:
              'border-white/10 text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-500/10',
            tabActive:
              'border-emerald-400/60 bg-gradient-to-r from-emerald-500/20 to-emerald-300/20 text-white shadow-[0_0_28px_rgba(16,185,129,0.35)]',
            accentA: '#10b981',
            accentB: '#059669',
            accentC: '#10b981',
            cardGlow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px rgba(16,185,129,0.16)',
          }
        : {
            page: 'bg-slate-50 text-slate-900',
            sidebar:
              'bg-white/80 border-slate-200/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(15,23,42,0.12)]',
            panel:
              'bg-white/80 border-slate-200/80 shadow-[0_20px_45px_rgba(15,23,42,0.1)]',
            muted: 'text-slate-600',
            tabBase:
              'border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50',
            tabActive:
              'border-emerald-400 bg-gradient-to-r from-emerald-100 to-emerald-50 text-slate-900 shadow-[0_0_28px_rgba(16,185,129,0.2)]',
            accentA: '#10b981',
            accentB: '#059669',
            accentC: '#10b981',
            cardGlow: '0 0 0 1px rgba(15,23,42,0.08), 0 18px 45px rgba(15,23,42,0.16)',
          },
    [isDark],
  );

  const value = useMemo(
    () => ({
      isDark,
      setIsDark,
      theme,
    }),
    [isDark, setIsDark, theme],
  );

  return (
    <AdminPanelContext.Provider value={value}>{children}</AdminPanelContext.Provider>
  );
}

export function useAdminPanel() {
  const context = useContext(AdminPanelContext);
  if (!context) {
    throw new Error('useAdminPanel must be used within AdminPanelProvider');
  }
  return context;
}

export function useAdminPanelOptional() {
  return useContext(AdminPanelContext);
}
