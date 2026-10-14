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
import {
  fetchUserNotificationCenter,
  markUserNotificationDelivered,
  type UserNotificationCenterItem,
} from '@/lib/user-notification-center-api';

type AdminShotNotificationContextValue = {
  activeOverlay: UserNotificationCenterItem | null;
  dismissOverlay: () => void;
};

const AdminShotNotificationContext =
  createContext<AdminShotNotificationContextValue | null>(null);

const POLL_MS = 45_000;
const OVERLAY_MS = 12_000;
const SESSION_SHOWN_KEY = 'fris-admin-notif-shown-ids';

function readSessionShownIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_SHOWN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => String(id)).filter(Boolean));
  } catch {
    return new Set();
  }
}

function markShownInSession(id: string) {
  if (typeof window === 'undefined' || !id) return;
  const next = readSessionShownIds();
  next.add(id);
  try {
    window.sessionStorage.setItem(SESSION_SHOWN_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore quota */
  }
}

/**
 * Admin broadcast / universal popups.
 * Each notification shows at most `maxPopupShows` (default 2) times per user.
 * Same browser session shows it once; next login/session can show the second time.
 */
export function AdminShotNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeOverlay, setActiveOverlay] = useState<UserNotificationCenterItem | null>(
    null,
  );
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showingPopup = useRef(false);

  const dismissOverlay = useCallback(() => {
    setActiveOverlay(null);
    showingPopup.current = false;
    if (overlayTimer.current) {
      clearTimeout(overlayTimer.current);
      overlayTimer.current = null;
    }
  }, []);

  const pollPopupNotifications = useCallback(async () => {
    if (showingPopup.current) return;
    try {
      const pending = await fetchUserNotificationCenter({ popupOnly: true });
      const shownThisSession = readSessionShownIds();
      const row = pending.rows.find((item) => !shownThisSession.has(item.id));
      if (!row) return;

      const marked = await markUserNotificationDelivered(row.id);
      if (!marked) return;

      markShownInSession(row.id);
      showingPopup.current = true;
      setActiveOverlay(row);
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      overlayTimer.current = setTimeout(() => dismissOverlay(), OVERLAY_MS);
    } catch {
      /* ignore poll errors */
    }
  }, [dismissOverlay]);

  useEffect(() => {
    void pollPopupNotifications();
    const timer = window.setInterval(() => void pollPopupNotifications(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollPopupNotifications]);

  const value = useMemo(
    () => ({
      activeOverlay,
      dismissOverlay,
    }),
    [activeOverlay, dismissOverlay],
  );

  return (
    <AdminShotNotificationContext.Provider value={value}>
      {children}
    </AdminShotNotificationContext.Provider>
  );
}

export function useAdminShotNotification() {
  const ctx = useContext(AdminShotNotificationContext);
  if (!ctx) {
    throw new Error(
      'useAdminShotNotification must be used within AdminShotNotificationProvider',
    );
  }
  return ctx;
}
