// @ts-nocheck
'use client';

import { useState } from 'react';
import {
  resetBillingWorkspace,
  useBillingWorkspaceIdentity,
} from '../../lib/billing-workspace';

/**
 * Explicit personal UI reset — clears Billing workspace slices + React Query
 * cache for this browser session. Does not log out or change Mongo data.
 */
export function BillingWorkspaceResetCard() {
  const identity = useBillingWorkspaceIdentity();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const onReset = () => {
    const ok = window.confirm(
      'Reset your personal Billing workspace?\n\n' +
        'This clears filters, selections, and cached list views for your login on this browser.\n' +
        'It does not delete invoices, customers, or other shared billing data.',
    );
    if (!ok) return;
    setBusy(true);
    setMsg('');
    try {
      resetBillingWorkspace();
      setMsg('Personal Billing workspace cleared. Open a page again to start fresh.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:p-6"
      aria-labelledby="billing-workspace-reset-heading"
    >
      <h2
        id="billing-workspace-reset-heading"
        className="text-base font-semibold text-gray-900"
      >
        Personal workspace
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Filters, selections, and navigation state are private to{' '}
        {identity?.userId ? (
          <span className="font-medium text-gray-800">{identity.userId}</span>
        ) : (
          'your login'
        )}
        {identity?.stationCode ? (
          <>
            {' '}
            at station{' '}
            <span className="font-medium text-gray-800">{identity.stationCode}</span>
          </>
        ) : null}
        . Shared billing records are not affected.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !identity?.userId}
          onClick={onReset}
          className="rounded-lg border border-amber-700 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Resetting…' : 'Reset billing workspace'}
        </button>
        {msg ? (
          <p className="text-sm text-gray-700" role="status">
            {msg}
          </p>
        ) : null}
      </div>
    </section>
  );
}
