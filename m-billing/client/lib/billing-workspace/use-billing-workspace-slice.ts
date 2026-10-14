'use client';

import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  getBillingWorkspacePageSlice,
  setBillingWorkspacePageSlice,
  useBillingWorkspaceState,
} from './store';

function resolveAction<T>(action: SetStateAction<T>, prev: T): T {
  return typeof action === 'function'
    ? (action as (p: T) => T)(prev)
    : action;
}

/**
 * Subscribe to one page slice. Missing slice → `createDefault()` (not written
 * until the first set/patch so untouched pages stay empty).
 */
export function useBillingWorkspaceSlice<T>(
  pageKey: string,
  createDefault: () => T,
): {
  slice: T;
  setSlice: Dispatch<SetStateAction<T>>;
  patchSlice: (partial: Partial<T>) => void;
  setField: <K extends keyof T>(key: K, value: SetStateAction<T[K]>) => void;
} {
  const workspace = useBillingWorkspaceState();
  const stored = workspace.pages[pageKey] as T | undefined;
  const defaults = useMemo(createDefault, [createDefault]);
  const slice = stored ?? defaults;

  const setSlice = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      setBillingWorkspacePageSlice<T>(pageKey, (prev) => {
        const base = prev ?? createDefault();
        return resolveAction(action, base);
      });
    },
    [createDefault, pageKey],
  );

  const patchSlice = useCallback(
    (partial: Partial<T>) => {
      setSlice((prev) => ({ ...prev, ...partial }));
    },
    [setSlice],
  );

  const setField = useCallback(
    <K extends keyof T>(key: K, value: SetStateAction<T[K]>) => {
      setSlice((prev) => ({
        ...prev,
        [key]: resolveAction(value, prev[key]),
      }));
    },
    [setSlice],
  );

  return { slice, setSlice, patchSlice, setField };
}

/** Read slice outside React (event handlers / lazy init). */
export function readBillingWorkspaceSlice<T>(
  pageKey: string,
  createDefault: () => T,
): T {
  return getBillingWorkspacePageSlice<T>(pageKey) ?? createDefault();
}

/**
 * SetState-compatible wrapper around a string[] field exposed as Set<string>.
 */
export function useWorkspaceStringSet(
  pageKey: string,
  field: string,
  createDefault: () => Record<string, unknown>,
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const workspace = useBillingWorkspaceState();
  const stored = workspace.pages[pageKey] as Record<string, unknown> | undefined;
  const ids = (stored?.[field] as string[] | undefined) ?? [];
  const setValue = useMemo(() => new Set(ids), [ids.join('\0')]);

  const setSet = useCallback<Dispatch<SetStateAction<Set<string>>>>(
    (action) => {
      setBillingWorkspacePageSlice<Record<string, unknown>>(pageKey, (prev) => {
        const base = prev ?? createDefault();
        const prevSet = new Set((base[field] as string[] | undefined) ?? []);
        const next = resolveAction(action, prevSet);
        return { ...base, [field]: [...next] };
      });
    },
    [createDefault, field, pageKey],
  );

  return [setValue, setSet];
}
