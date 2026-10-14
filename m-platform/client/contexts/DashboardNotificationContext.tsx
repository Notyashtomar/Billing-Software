'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type NotificationType = 'flight_cancelled' | 'new_flight' | 'delay';

export type DashboardNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  /** `flight_cancellations` document `_id` values to glow on the cancellation history page after click */
  highlightCancellationIds?: string[];
};

export type DashboardNotification = DashboardNotificationInput & {
  id: string;
  createdAt: number;
};

/** Cancellation history is treated as the “alerts” surface for operational cancellations */
export const CANCELLATION_ALERTS_PATH = '/fris/flights/cancellation-history' as const;
export const CANCELLATION_HIGHLIGHT_STORAGE_KEY = 'fris-cancellation-highlight' as const;
/** STA operating day (YYYY-MM-DD) to include when opening cancellation history after a cancel. */
export const CANCELLATION_FOCUS_DATE_KEY = 'fris-cancellation-history-focus-date' as const;

export function stashCancellationHistoryFocusDate(ymd: string): void {
  if (typeof window === 'undefined') return;
  const focus = String(ymd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(focus)) return;
  sessionStorage.setItem(CANCELLATION_FOCUS_DATE_KEY, focus);
}

export function stashCancellationHistoryHighlight(id: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = String(id ?? '').trim();
  if (!trimmed) return;
  sessionStorage.setItem(CANCELLATION_HIGHLIGHT_STORAGE_KEY, JSON.stringify([trimmed]));
}

const DISMISS_MS = 8500;
const EVENT_NAME = 'fris:dashboard-notification';

type DashboardNotificationContextValue = {
  notifications: DashboardNotification[];
  addNotification: (n: DashboardNotificationInput) => void;
  removeNotification: (id: string) => void;
  isDesktopCursor: boolean;
};

const DashboardNotificationContext = createContext<DashboardNotificationContextValue | null>(null);

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function DashboardNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [isDesktopCursor, setIsDesktopCursor] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px) and (pointer: fine)');
    const apply = () => setIsDesktopCursor(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const addNotification = useCallback((input: DashboardNotificationInput) => {
    const item: DashboardNotification = {
      ...input,
      id: makeId(),
      createdAt: Date.now(),
    };
    setNotifications((prev) => [item, ...prev].slice(0, 6));
    const tid = setTimeout(() => removeNotification(item.id), DISMISS_MS);
    timersRef.current.set(item.id, tid);
  }, [removeNotification]);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<DashboardNotificationInput>;
      if (!ce.detail?.title) return;
      addNotification(ce.detail);
    };
    window.addEventListener(EVENT_NAME, onCustom);
    return () => window.removeEventListener(EVENT_NAME, onCustom);
  }, [addNotification]);

  const value = useMemo(
    () => ({
      notifications,
      addNotification,
      removeNotification,
      isDesktopCursor,
    }),
    [notifications, addNotification, removeNotification, isDesktopCursor],
  );

  return (
    <DashboardNotificationContext.Provider value={value}>{children}</DashboardNotificationContext.Provider>
  );
}

export function useDashboardNotifications() {
  const ctx = useContext(DashboardNotificationContext);
  if (!ctx) {
    throw new Error('useDashboardNotifications must be used within DashboardNotificationProvider');
  }
  return ctx;
}

/** Fire-and-forget from anywhere (forms, services) without React context. */
export function dispatchDashboardNotification(detail: DashboardNotificationInput) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}
