'use client';

import { useCallback } from 'react';
import { BILLING_WORKSPACE_PAGE_KEYS } from './page-keys';
import {
  createSourcePageWorkspaceSlice,
  type SourceColumnFilters,
  type SourceDateBasis,
  type SourceDomIntFilter,
} from './slices';
import { useBillingWorkspaceSlice, useWorkspaceStringSet } from './use-billing-workspace-slice';

export type SourcePageWorkspaceConfig = {
  fetchMethod: string;
  defaultFrom: string;
  defaultTo: string;
  initialDateBasis: SourceDateBasis;
  requiresManualSearch: boolean;
};

/**
 * Personal UI state for OperationalSourcePage — survives Billing route changes.
 * Scoped per user+station via BillingWorkspaceProvider.
 */
export function useSourcePageWorkspace(config: SourcePageWorkspaceConfig) {
  const pageKey = BILLING_WORKSPACE_PAGE_KEYS.source(config.fetchMethod);
  const createDefault = useCallback(
    () =>
      createSourcePageWorkspaceSlice({
        from: config.defaultFrom,
        to: config.defaultTo,
        dateBasis: config.initialDateBasis,
        searchSubmitted: !config.requiresManualSearch,
      }),
    [
      config.defaultFrom,
      config.defaultTo,
      config.initialDateBasis,
      config.requiresManualSearch,
    ],
  );

  const { slice, setField, patchSlice } = useBillingWorkspaceSlice(
    pageKey,
    createDefault,
  );
  const [selected, setSelected] = useWorkspaceStringSet(
    pageKey,
    'selectedIds',
    createDefault,
  );
  const [statFilters, setStatFilters] = useWorkspaceStringSet(
    pageKey,
    'statFilterKeys',
    createDefault,
  );
  const [adsBriefFilters, setAdsBriefFilters] = useWorkspaceStringSet(
    pageKey,
    'adsBriefFilterKeys',
    createDefault,
  );

  const setDraftFrom = useCallback(
    (value: string) => setField('draftFrom', value),
    [setField],
  );
  const setDraftTo = useCallback(
    (value: string) => setField('draftTo', value),
    [setField],
  );
  const setDraftDateBasis = useCallback(
    (value: SourceDateBasis) => setField('draftDateBasis', value),
    [setField],
  );
  const setQueryFrom = useCallback(
    (value: string) => setField('queryFrom', value),
    [setField],
  );
  const setQueryTo = useCallback(
    (value: string) => setField('queryTo', value),
    [setField],
  );
  const setQueryDateBasis = useCallback(
    (value: SourceDateBasis) => setField('queryDateBasis', value),
    [setField],
  );
  const setCustomerCode = useCallback(
    (value: string) => setField('customerCode', value),
    [setField],
  );
  const setQueryCustomerCode = useCallback(
    (value: string) => setField('queryCustomerCode', value),
    [setField],
  );
  const setFlightNo = useCallback(
    (value: string) => setField('flightNo', value),
    [setField],
  );
  const setDomIntFilter = useCallback(
    (value: SourceDomIntFilter) => setField('domIntFilter', value),
    [setField],
  );
  const setAdsErrorsOnly = useCallback(
    (value: boolean) => setField('adsErrorsOnly', value),
    [setField],
  );
  const setSearchSubmitted = useCallback(
    (value: boolean) => setField('searchSubmitted', value),
    [setField],
  );
  const setColumnFilters = useCallback(
    (
      value:
        | SourceColumnFilters
        | ((prev: SourceColumnFilters) => SourceColumnFilters),
    ) => setField('columnFilters', value),
    [setField],
  );

  return {
    slice,
    patchSlice,
    selected,
    setSelected,
    statFilters,
    setStatFilters,
    adsBriefFilters,
    setAdsBriefFilters,
    setDraftFrom,
    setDraftTo,
    setDraftDateBasis,
    setQueryFrom,
    setQueryTo,
    setQueryDateBasis,
    setCustomerCode,
    setQueryCustomerCode,
    setFlightNo,
    setDomIntFilter,
    setAdsErrorsOnly,
    setSearchSubmitted,
    setColumnFilters,
  };
}
