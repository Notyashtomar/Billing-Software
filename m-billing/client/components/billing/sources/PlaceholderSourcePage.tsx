'use client';

import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';

/** Tab-only stub for Billed Services that are not wired to a data source yet. */
export function PlaceholderSourcePage({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-w-0">
      <BillingPageHeader title={title} description={description} />
      <div className={`${billingUi.card} flex min-h-[240px] items-center justify-center p-8 text-center`}>
        <div>
          <p className="text-sm font-semibold text-[color:var(--billing-text)]">{title} billing is coming soon</p>
          <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
            The tab is in place; the operational source, rates and invoice lines will be connected next.
          </p>
        </div>
      </div>
    </div>
  );
}
