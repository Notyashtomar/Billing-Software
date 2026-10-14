'use client';

import { useId, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { billingApi } from '@/lib/billing-api';
import {
  CustomBillingForm,
  type CustomBillingLine,
} from '@/components/billing/preparation/CustomBillingForm';
import { parseAdvanceAmount } from './nonScheduledAdvanceInvoice';

export type NonScheduledCustomBillingPrefill = {
  airlineCode: string;
  airlineBillTo: string;
  companyName: string;
  flightNo: string;
  bookingNo: string;
  registrationNo: string;
  routing: string;
  aircraftType: string;
  opsType: string;
  categoryOfFlight: string;
  bookingDate: string;
  staDate: string;
  stdDate: string;
  amount: string;
};

type AircraftOption = { value: string; label: string };

export type NonScheduledAirlineOption = {
  value: string;
  label: string;
  code: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: NonScheduledCustomBillingPrefill;
  airlineOptions?: NonScheduledAirlineOption[];
  aircraftOptions?: AircraftOption[];
};

/** Convert DD/MM/YYYY (or YYYY-MM-DD) → YYYY-MM-DD for date inputs. */
function toIsoDate(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}

export default function NonScheduledCustomBillingDialog({
  open,
  onOpenChange,
  prefill,
  airlineOptions = [],
  aircraftOptions = [],
}: Props) {
  const titleId = useId();
  const periodFrom = useMemo(
    () => toIsoDate(prefill.staDate) || toIsoDate(prefill.bookingDate),
    [prefill.staDate, prefill.bookingDate],
  );
  const periodTo = useMemo(
    () =>
      toIsoDate(prefill.stdDate) ||
      toIsoDate(prefill.staDate) ||
      toIsoDate(prefill.bookingDate),
    [prefill.stdDate, prefill.staDate, prefill.bookingDate],
  );

  const defaultCustomerCode = useMemo(
    () => prefill.airlineCode.trim().toUpperCase(),
    [prefill.airlineCode],
  );

  const defaultLines = useMemo((): CustomBillingLine[] => {
    const amount = parseAdvanceAmount(prefill.amount);
    const rate = Number.isFinite(amount) && amount > 0 ? amount : 0;
    return [
      {
        particular: '',
        used: 1,
        charged: 1,
        aircraftType: prefill.aircraftType.trim(),
        unit: 'Per Service',
        ratePerUnit: rate,
      },
    ];
  }, [prefill.amount, prefill.aircraftType]);

  const contextNote = useMemo(() => {
    const bits = [
      prefill.airlineBillTo.trim() || prefill.companyName.trim() || defaultCustomerCode,
      prefill.flightNo.trim() ? `Flight ${prefill.flightNo.trim()}` : null,
      prefill.bookingNo.trim() ? `Booking ${prefill.bookingNo.trim()}` : null,
      prefill.registrationNo.trim()
        ? `Reg ${prefill.registrationNo.trim()}`
        : null,
    ].filter(Boolean);
    return bits.length
      ? `Billing this non-scheduled flight: ${bits.join(' · ')}`
      : 'Custom bill for the current non-scheduled booking. Select equipment from the catalog.';
  }, [prefill, defaultCustomerCode]);

  const formKey = [
    open ? 'open' : 'closed',
    defaultCustomerCode,
    prefill.flightNo,
    prefill.bookingNo,
    periodFrom,
    periodTo,
  ].join('|');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(94dvh,52rem)] w-[min(100%,64rem)] flex-col gap-0 border-amber-100 p-0 sm:max-w-5xl"
        aria-labelledby={titleId}
      >
        <DialogHeader className="shrink-0 border-b border-amber-100 px-4 py-4 sm:px-6">
          <DialogTitle id={titleId} className="text-slate-900">
            Custom Billing
          </DialogTitle>
          <DialogDescription>
            Airline and aircraft match the Non-Scheduled booking form. Pick equipment from the
            billing catalog, then submit to create an invoice draft under Custom Bills.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {open ? (
            <CustomBillingForm
              key={formKey}
              api={billingApi}
              defaultFrom={periodFrom}
              defaultTo={periodTo}
              defaultCustomerCode={defaultCustomerCode}
              // @ts-ignore
defaultAirlineName={prefill.airlineBillTo.trim()}
              defaultLines={defaultLines}
              particularScope="non-scheduled"
              airlineOptions={airlineOptions}
              aircraftOptions={aircraftOptions}
              contextNote={contextNote}
              flightContext={{
                flightNo: prefill.flightNo.trim() || 'CUSTOM',
                bookingNo: prefill.bookingNo.trim() || undefined,
                registrationNo: prefill.registrationNo.trim() || undefined,
                routing: prefill.routing.trim() || undefined,
                opsType: prefill.opsType.trim() || undefined,
                aircraftType: prefill.aircraftType.trim() || undefined,
                categoryOfFlight: prefill.categoryOfFlight.trim() || undefined,
              }}
              onSubmitted={(message) => {
                toast.success(message, {
                  action: {
                    label: 'Open drafts',
                    onClick: () => {
                      window.open('/billing/invoice-drafts', '_blank', 'noopener,noreferrer');
                    },
                  },
                });
                onOpenChange(false);
              }}
            />
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            Need the full billing workspace?{' '}
            <Link
              href="/billing/preparation?tab=custom"
              className="font-medium text-amber-800 underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Preparation → Custom
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
