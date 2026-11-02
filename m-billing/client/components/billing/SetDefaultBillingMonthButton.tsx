'use client';

import { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { saveDefaultBillingMonth } from '@/lib/billing-default-month';
import { billingUi } from './billingUi';

type Props = {
  monthValue: string;
  onApplied: (range: { from: string; to: string }) => void;
};

/** Saves a calendar month as the billing date range on this station. */
export function SetDefaultBillingMonthButton({ monthValue, onApplied }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className={billingUi.btnSecondary}
        title="Saves this month as the default date range across the billing system"
      >
        <Calendar className="h-4 w-4" aria-hidden />
        Set default month
      </button>
      <input
        ref={inputRef}
        type="month"
        aria-label="Set default month for the billing system"
        min="2000-01"
        max="2100-12"
        value={/^\d{4}-\d{2}$/.test(monthValue) ? monthValue : ''}
        onChange={(event) => {
          const range = saveDefaultBillingMonth(event.target.value);
          if (range) onApplied(range);
        }}
        tabIndex={-1}
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
    </div>
  );
}
