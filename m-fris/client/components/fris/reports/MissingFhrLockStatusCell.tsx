'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchFhrCollectionFlightLean } from '@/lib/api';
import {
  buildAirlinesHrefFromMissingFhr,
  type MissingFhrFlightKind,
  type MissingFhrReturnContext,
} from '@/lib/missingFhrScheduledAirlinesNav';
import {
  fetchNsFormPresence,
  formPresenceFromFhrDoc,
  lockIsOpen,
  pendingFormsForLock,
  type FormPresenceFlags,
  type LockKind,
  type PendingFormLink,
} from '@/components/fris/reports/missingFhrPendingForms';

type MissingFhrLockStatusCellProps = {
  lockKind: LockKind;
  locked: boolean;
  tableSerial: string;
  operationalSerial: string;
  flightKind: MissingFhrFlightKind;
  dateContext: MissingFhrReturnContext;
  onPresenceUpdated: (presence: FormPresenceFlags) => void;
};

export default function MissingFhrLockStatusCell({
  lockKind,
  locked,
  tableSerial,
  operationalSerial,
  flightKind,
  dateContext,
  onPresenceUpdated,
}: MissingFhrLockStatusCellProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingForms, setPendingForms] = useState<PendingFormLink[]>([]);
  const [liveLocked, setLiveLocked] = useState(locked);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLiveLocked(locked);
  }, [locked]);

  const refreshPending = useCallback(async () => {
    if (!operationalSerial.trim()) return;
    setLoading(true);
    try {
      let presence: FormPresenceFlags;
      if (flightKind === 'non-scheduled') {
        const fhr = await fetchFhrCollectionFlightLean(operationalSerial);
        presence = fhr
          ? formPresenceFromFhrDoc(fhr)
          : await fetchNsFormPresence(operationalSerial);
      } else {
        presence = formPresenceFromFhrDoc(await fetchFhrCollectionFlightLean(operationalSerial));
      }
      onPresenceUpdated(presence);
      const stillOpen = lockIsOpen(lockKind, presence);
      setLiveLocked(!stillOpen);
      setPendingForms(stillOpen ? pendingFormsForLock(lockKind, presence) : []);
      if (!stillOpen) setPanelOpen(false);
    } finally {
      setLoading(false);
    }
  }, [flightKind, lockKind, onPresenceUpdated, operationalSerial]);

  const openPanel = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const panelWidth = Math.min(window.innerWidth - 24, 224);
      const left = Math.min(
        Math.max(panelWidth / 2 + 12, rect.left + rect.width / 2),
        window.innerWidth - panelWidth / 2 - 12,
      );
      setPopoverPos({
        top: rect.bottom + 8,
        left,
      });
    }
    setPanelOpen(true);
    void refreshPending();
  };

  const scheduleClosePanel = () => {
    closeTimerRef.current = window.setTimeout(() => {
      setPanelOpen(false);
      closeTimerRef.current = null;
    }, 180);
  };

  const togglePanel = () => {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    openPanel();
  };

  useEffect(() => {
    if (!panelOpen || liveLocked) return;
    const id = window.setInterval(() => {
      void refreshPending();
    }, 4000);
    return () => window.clearInterval(id);
  }, [panelOpen, liveLocked, refreshPending]);

  useEffect(
    () => () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (liveLocked) {
    return <span className="text-emerald-700">Locked</span>;
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={openPanel}
      onMouseLeave={scheduleClosePanel}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={togglePanel}
        className="min-h-[36px] touch-manipulation rounded-md px-1 py-1 font-medium text-rose-600 underline decoration-rose-300 decoration-dotted underline-offset-2 hover:text-rose-700"
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
      >
        Open
      </button>

      {panelOpen && popoverPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[200] w-[min(calc(100vw-1.5rem),14rem)] -translate-x-1/2 rounded-xl border border-emerald-200/90 bg-white p-3 text-left shadow-lg shadow-emerald-950/10 ring-1 ring-emerald-900/[0.04]"
              style={{ top: popoverPos.top, left: popoverPos.left }}
              onMouseEnter={openPanel}
              onMouseLeave={scheduleClosePanel}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                Pending forms
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Flight {tableSerial} ·{' '}
                {flightKind === 'non-scheduled' ? 'Non-scheduled' : 'Scheduled'} · saved forms
                disappear here automatically
              </p>

              <div className="mt-2 space-y-1.5">
                {loading && pendingForms.length === 0 ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Checking saved forms…
                  </div>
                ) : pendingForms.length === 0 ? (
                  <p className="py-1 text-xs text-emerald-700">All required forms are saved.</p>
                ) : (
                  pendingForms.map((form) => (
                    <Link
                      key={form.id}
                      href={buildAirlinesHrefFromMissingFhr(
                        flightKind,
                        tableSerial,
                        dateContext,
                        form.id,
                      )}
                      className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-2 text-xs font-medium text-emerald-900 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
                    >
                      <span>{form.label}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                    </Link>
                  ))
                )}
              </div>

              {loading && pendingForms.length > 0 ? (
                <p className={cn('mt-2 flex items-center gap-1.5 text-[10px] text-slate-400')}>
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Refreshing…
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
