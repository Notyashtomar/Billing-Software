'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { clearInvoiceDraftParticularsCache } from './particulars-cache';
import type {
  BillingWorkspaceIdentity,
  BillingWorkspacePages,
  BillingWorkspaceState,
} from './types';

function emptyState(): BillingWorkspaceState {
  return { identity: null, pages: {} };
}

const STORAGE_PREFIX = 'fris.billing.workspace.v1:';

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function persistKey(identity: BillingWorkspaceIdentity): string {
  return `${STORAGE_PREFIX}${identityKey(identity)}`;
}

function readPersistedPages(identity: BillingWorkspaceIdentity): BillingWorkspacePages {
  const storage = browserStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(persistKey(identity));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as BillingWorkspacePages;
  } catch {
    return {};
  }
}

function writePersistedPages(
  identity: BillingWorkspaceIdentity,
  pages: BillingWorkspacePages,
): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(persistKey(identity), JSON.stringify(pages));
  } catch {
    // Quota or private mode — in-memory workspace still works for this tab.
  }
}

let state: BillingWorkspaceState = emptyState();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BillingWorkspaceState {
  return state;
}

/** Server snapshot — workspace is client-only. */
function getServerSnapshot(): BillingWorkspaceState {
  return emptyState();
}

function readSessionIdentity(): BillingWorkspaceIdentity | null {
  if (typeof window === 'undefined') return null;
  const userId = (
    localStorage.getItem('userId') ||
    localStorage.getItem('userid') ||
    ''
  ).trim();
  const stationCode = (localStorage.getItem('userStationCode') || '')
    .trim()
    .toUpperCase();
  if (!userId) return null;
  return { userId, stationCode };
}

function identityKey(identity: BillingWorkspaceIdentity | null): string {
  if (!identity) return '';
  return `${identity.userId}|${identity.stationCode}`;
}

type ResetBillingWorkspaceOptions = {
  /**
   * When true (logout / session clear), drop identity too.
   * Default false keeps the logged-in user so pages can rehydrate empty slices.
   */
  clearIdentity?: boolean;
};

let onWorkspaceResetExtra: (() => void) | null = null;

/** Register side effects for reset (e.g. clear Billing React Query cache). */
export function registerBillingWorkspaceResetHook(fn: (() => void) | null): void {
  onWorkspaceResetExtra = fn;
}

/**
 * Wipe personal UI workspace and preview caches.
 * Call on logout, session expire, station/user switch, or explicit reset.
 */
export function resetBillingWorkspace(options?: ResetBillingWorkspaceOptions): void {
  const previous = state.identity;
  if (options?.clearIdentity) {
    state = emptyState();
  } else {
    state = { identity: state.identity, pages: {} };
    if (previous) writePersistedPages(previous, {});
  }
  clearInvoiceDraftParticularsCache();
  onWorkspaceResetExtra?.();
  emit();
}

/**
 * Bind workspace to the current FRIS session user + station.
 * Resets when identity changes so UI state never leaks across users.
 */
export function bindBillingWorkspaceIdentity(
  next?: BillingWorkspaceIdentity | null,
): BillingWorkspaceIdentity | null {
  const identity = next === undefined ? readSessionIdentity() : next;
  if (!identity?.userId) {
    if (state.identity !== null || Object.keys(state.pages).length > 0) {
      resetBillingWorkspace({ clearIdentity: true });
    }
    return null;
  }

  if (identityKey(state.identity) !== identityKey(identity)) {
    state = { identity, pages: readPersistedPages(identity) };
    clearInvoiceDraftParticularsCache();
    onWorkspaceResetExtra?.();
    emit();
    return identity;
  }

  return state.identity;
}

export function getBillingWorkspaceIdentity(): BillingWorkspaceIdentity | null {
  return state.identity;
}

export function getBillingWorkspaceState(): BillingWorkspaceState {
  return state;
}

/** Read a page slice (Phase 2+). Missing key → undefined. */
export function getBillingWorkspacePageSlice<T = unknown>(
  pageKey: string,
): T | undefined {
  return state.pages[pageKey] as T | undefined;
}

/**
 * Replace or merge a page slice. No-op when workspace has no identity
 * (avoids writing orphan UI state before login bind).
 */
export function setBillingWorkspacePageSlice<T>(
  pageKey: string,
  value: T | ((prev: T | undefined) => T),
): void {
  if (!state.identity || !pageKey) return;
  const prev = state.pages[pageKey] as T | undefined;
  const next =
    typeof value === 'function'
      ? (value as (p: T | undefined) => T)(prev)
      : value;
  state = {
    ...state,
    pages: { ...state.pages, [pageKey]: next },
  };
  if (state.identity) writePersistedPages(state.identity, state.pages);
  emit();
}

export function clearBillingWorkspacePageSlice(pageKey: string): void {
  if (!pageKey || !(pageKey in state.pages)) return;
  const pages: BillingWorkspacePages = { ...state.pages };
  delete pages[pageKey];
  state = { ...state, pages };
  if (state.identity) writePersistedPages(state.identity, state.pages);
  emit();
}

export function useBillingWorkspaceState(): BillingWorkspaceState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useBillingWorkspaceIdentity(): BillingWorkspaceIdentity | null {
  return useBillingWorkspaceState().identity;
}

/** Stable reset helper for UI (e.g. future “Reset workspace” control). */
export function useResetBillingWorkspace(): () => void {
  return useCallback(() => {
    resetBillingWorkspace();
  }, []);
}
