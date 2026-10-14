'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CONTACT_BTN_TRANSITION } from '@/components/fris/advance/contactShared';

type ContactSignatureCellProps = {
  signatureUrl: string;
  label: string;
};

/**
 * Table signature badge: hover → floating preview; click → high-res modal.
 */
export function ContactSignatureCell({ signatureUrl, label }: ContactSignatureCellProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!signatureUrl) {
    return <span className="text-xs text-gray-400">Not set</span>;
  }

  return (
    <>
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setModalOpen(true);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/40 ${CONTACT_BTN_TRANSITION}`}
            title="Preview signature"
            aria-label={`Preview signature for ${label}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signatureUrl}
              alt=""
              className="h-7 max-w-[5.5rem] object-contain"
            />
            <Eye className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="center"
          className="w-auto border-gray-200 bg-white p-2 shadow-lg"
          style={{
            transformOrigin: 'var(--radix-hover-card-content-transform-origin)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureUrl}
            alt={`${label} signature preview`}
            className="max-h-28 max-w-[14rem] object-contain"
          />
        </HoverCardContent>
      </HoverCard>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-lg border-gray-200 bg-white duration-[180ms] ease-out data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-base text-gray-900">Signature preview</DialogTitle>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureUrl}
            alt={`${label} signature`}
            className="mx-auto max-h-56 w-full rounded-lg border border-gray-200 bg-gray-50 object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
