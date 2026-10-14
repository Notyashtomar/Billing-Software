'use client';

import { useCallback, useEffect, useState } from 'react';

export const CANCELLATION_BELL_STORAGE_KEY = 'fris-cancellation-bell-dismissed-at';
export const CANCELLATION_BELL_EVENT_KEY = 'fris-cancellation-bell-event';
export const CANCELLATION_BELL_CHANNEL = 'fris-cancellation-bell';
export const CANCELLATION_BELL_WINDOW_EVENT = 'fris:cancellation-bell';

export type CancellationBellEvent = {
  cancelledAt: number;
  cancellationId?: string;
  stationCode?: string;
  flightKind?: string;
};

function isClient(): boolean {
  return typeof window !== 'undefined';
}

export function readCancellationBellEvent(): CancellationBellEvent | null {
  if (!isClient()) return null;
  const raw = localStorage.getItem(CANCELLATION_BELL_EVENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'cancelledAt' in parsed) {
      return parsed as CancellationBellEvent;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function readCancellationBellDismissedAt(): number {
  if (!isClient()) return 0;
  const raw = localStorage.getItem(CANCELLATION_BELL_STORAGE_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isCancellationBellVisible(): boolean {
  if (!isClient()) return false;
  const event = readCancellationBellEvent();
  const dismissedAt = readCancellationBellDismissedAt();
  return Boolean(event && event.cancelledAt > dismissedAt);
}

export function broadcastCancellationEvent(event: CancellationBellEvent): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(CANCELLATION_BELL_EVENT_KEY, JSON.stringify(event));
  } catch {
    /* ignore private-mode / quota errors */
  }
  try {
    const bc = new BroadcastChannel(CANCELLATION_BELL_CHANNEL);
    bc.postMessage(event);
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
  try {
    window.dispatchEvent(
      new CustomEvent<CancellationBellEvent>(CANCELLATION_BELL_WINDOW_EVENT, {
        detail: event,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function dismissCancellationBell(): void {
  if (!isClient()) return;
  const now = Date.now();
  try {
    localStorage.setItem(CANCELLATION_BELL_STORAGE_KEY, String(now));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(CANCELLATION_BELL_CHANNEL);
    bc.postMessage({ dismissedAt: now });
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

export function useCancellationBell(
  onEvent?: (event: CancellationBellEvent) => void,
): {
  visible: boolean;
  dismiss: () => void;
} {
  const [visible, setVisible] = useState(false);

  const sync = useCallback(() => {
    setVisible(isCancellationBellVisible());
  }, []);

  useEffect(() => {
    sync();

    const onStorage = (e: StorageEvent) => {
      if (
        e.key === CANCELLATION_BELL_EVENT_KEY ||
        e.key === CANCELLATION_BELL_STORAGE_KEY
      ) {
        sync();
        if (e.key === CANCELLATION_BELL_EVENT_KEY) {
          const event = readCancellationBellEvent();
          if (event && onEvent) onEvent(event);
        }
      }
    };

    const onWindow = (e: Event) => {
      const detail = (e as CustomEvent<CancellationBellEvent>).detail;
      if (detail?.cancelledAt) {
        setVisible(true);
        if (onEvent) onEvent(detail);
      }
    };

    let bc: BroadcastChannel | undefined;
    const onBroadcast = (e: MessageEvent<unknown>) => {
      const data = e.data as { cancelledAt?: number; dismissedAt?: number } | undefined;
      if (data?.cancelledAt) {
        setVisible(true);
        if (onEvent) onEvent(data as CancellationBellEvent);
      } else if (data?.dismissedAt) {
        sync();
      }
    };

    try {
      bc = new BroadcastChannel(CANCELLATION_BELL_CHANNEL);
      bc.onmessage = onBroadcast;
    } catch {
      /* unsupported */
    }

    window.addEventListener('storage', onStorage);
    window.addEventListener(CANCELLATION_BELL_WINDOW_EVENT, onWindow);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CANCELLATION_BELL_WINDOW_EVENT, onWindow);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
  }, [sync, onEvent]);

  return { visible, dismiss: dismissCancellationBell };
}
