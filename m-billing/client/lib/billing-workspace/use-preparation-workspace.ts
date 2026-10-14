'use client';

import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { BILLING_WORKSPACE_PAGE_KEYS } from './page-keys';
import { createPreparationWorkspaceSlice } from './slices';
import { useBillingWorkspaceSlice } from './use-billing-workspace-slice';

function resolveAction<T>(action: SetStateAction<T>, prev: T): T {
  return typeof action === 'function'
    ? (action as (p: T) => T)(prev)
    : action;
}

type Options = {
  defaultFrom: string;
  defaultTo: string;
  tab: string;
};

/**
 * Preparation filters + selection — survives Billing route changes.
 */
export function usePreparationWorkspace({ defaultFrom, defaultTo, tab }: Options) {
  const pageKey = BILLING_WORKSPACE_PAGE_KEYS.preparation;
  const createDefault = useCallback(
    () => createPreparationWorkspaceSlice(defaultFrom, defaultTo),
    [defaultFrom, defaultTo],
  );
  const { slice, setSlice, setField } = useBillingWorkspaceSlice(
    pageKey,
    createDefault,
  );

  const from = slice.from || defaultFrom;
  const to = slice.to || defaultTo;
  const customerCode = slice.customerCode;
  const selectionQueryKey = `${tab}|${from}|${to}|${customerCode}`;
  const active = slice.selectionQueryKey === selectionQueryKey;

  const setFrom = useCallback(
    (value: string) => setField('from', value),
    [setField],
  );
  const setTo = useCallback(
    (value: string) => setField('to', value),
    [setField],
  );
  const setCustomerCode = useCallback(
    (value: string) => setField('customerCode', value),
    [setField],
  );

  const selected = useMemo(
    () => new Set(active ? slice.selectedIds : []),
    [active, slice.selectedIds.join('\0')],
  );
  const expanded = useMemo(
    () => new Set(active ? slice.expandedIds : []),
    [active, slice.expandedIds.join('\0')],
  );
  const selectAllMatching = active ? slice.selectAllMatching : false;

  const ensureKey = useCallback(
    (base: ReturnType<typeof createPreparationWorkspaceSlice>) =>
      base.selectionQueryKey === selectionQueryKey
        ? base
        : {
            ...base,
            from,
            to,
            customerCode,
            selectionQueryKey,
            selectedIds: [],
            expandedIds: [],
            selectAllMatching: false,
          },
    [customerCode, from, selectionQueryKey, to],
  );

  const setSelected = useCallback(
    (action: SetStateAction<Set<string>>) => {
      setSlice((prev) => {
        const base = ensureKey(prev);
        const prevSet = new Set(base.selectedIds);
        const next = resolveAction(action, prevSet);
        return { ...base, selectedIds: [...next] };
      });
    },
    [ensureKey, setSlice],
  );

  const setExpanded = useCallback(
    (action: SetStateAction<Set<string>>) => {
      setSlice((prev) => {
        const base = ensureKey(prev);
        const prevSet = new Set(base.expandedIds);
        const next = resolveAction(action, prevSet);
        return { ...base, expandedIds: [...next] };
      });
    },
    [ensureKey, setSlice],
  );

  const setSelectAllMatching = useCallback(
    (action: SetStateAction<boolean>) => {
      setSlice((prev) => {
        const base = ensureKey(prev);
        return {
          ...base,
          selectAllMatching: resolveAction(action, base.selectAllMatching),
        };
      });
    },
    [ensureKey, setSlice],
  );

  const clearSelection = useCallback(() => {
    setSlice((prev) => {
      const base = ensureKey(prev);
      return {
        ...base,
        selectedIds: [],
        selectAllMatching: false,
      };
    });
  }, [ensureKey, setSlice]);

  return {
    from,
    to,
    customerCode,
    setFrom,
    setTo,
    setCustomerCode,
    selected,
    setSelected,
    expanded,
    setExpanded,
    selectAllMatching,
    setSelectAllMatching,
    clearSelection,
  };
}
