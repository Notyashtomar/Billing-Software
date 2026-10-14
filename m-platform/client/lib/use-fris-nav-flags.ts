'use client';

import { useSyncExternalStore } from 'react';
import { FRIS_SESSION_UPDATED_EVENT } from '@/lib/fris-session';
import { parseUserNavFlags, type UserNavFlags } from '@/lib/nav-permissions';

/** Cached snapshot — useSyncExternalStore requires stable references between reads. */
let cachedRaw: string | null | undefined;
let cachedSnapshot: UserNavFlags | null = null;

function readFlags(): UserNavFlags | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem('userFlags');
  if (raw === cachedRaw) {
    return cachedSnapshot;
  }

  cachedRaw = raw;
  cachedSnapshot = parseUserNavFlags(raw);
  return cachedSnapshot;
}

function invalidateFlagCache(): void {
  cachedRaw = undefined;
}

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => {
    invalidateFlagCache();
    onStoreChange();
  };
  window.addEventListener(FRIS_SESSION_UPDATED_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(FRIS_SESSION_UPDATED_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/** Reactive FRIS nav flags (updates after session refresh or login). */
export function useFrisNavFlags(): UserNavFlags | null {
  return useSyncExternalStore(subscribe, readFlags, () => null);
}
