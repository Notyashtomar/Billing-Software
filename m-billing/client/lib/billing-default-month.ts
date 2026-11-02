'use client';

import {
  monthBoundsFromYearMonth,
  writeDefaultMonthAppliedStamp,
  writeStoredDefaultBillingMonth,
} from '@/lib/billing-default-period';
import { BILLING_WORKSPACE_PAGE_KEYS } from '@/lib/billing-workspace/page-keys';
import {
  getBillingWorkspaceState,
  setBillingWorkspacePageSlice,
} from '@/lib/billing-workspace/store';

const NAMED_SOURCE_KEYS = [
  BILLING_WORKSPACE_PAGE_KEYS.source('listAds'),
  BILLING_WORKSPACE_PAGE_KEYS.source('listScheduledFlights'),
];

/**
 * Remember a calendar month and copy that range onto billing pages that
 * already have a saved date filter. Pages opened later read the same month.
 */
export function saveDefaultBillingMonth(month: string): { from: string; to: string } | null {
  const range = monthBoundsFromYearMonth(month);
  if (!range) return null;
  writeStoredDefaultBillingMonth(month);

  const pageKeys = new Set<string>(['preparation', 'preparation.period', ...NAMED_SOURCE_KEYS]);
  const pages = getBillingWorkspaceState().pages;
  for (const key of Object.keys(pages)) {
    if (key.startsWith('sources.')) pageKeys.add(key);
  }

  for (const key of pageKeys) {
    writeDefaultMonthAppliedStamp(key, month);
    const slice = pages[key];
    if (!slice || typeof slice !== 'object') continue;
    const rec = slice as Record<string, unknown>;
    if (key.startsWith('sources.') && typeof rec.draftFrom === 'string') {
      setBillingWorkspacePageSlice(key, {
        ...rec,
        draftFrom: range.from,
        draftTo: range.to,
        queryFrom: range.from,
        queryTo: range.to,
      });
      continue;
    }
    if (typeof rec.from === 'string' || key === 'preparation.period') {
      setBillingWorkspacePageSlice(key, {
        ...rec,
        from: range.from,
        to: range.to,
      });
    }
  }

  return range;
}
