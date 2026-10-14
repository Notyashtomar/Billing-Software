'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  PenLine,
  ShieldCheck,
  CheckCircle2,
  Clock,
  X,
  Loader2,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchFhrSignatures,
  saveFhrSignature,
  finalizeFhr,
  type FhrSignatureParty,
  type FhrSignatureView,
} from '@/lib/api';
import SignaturePad from './SignaturePad';

export interface SignatureSectionState {
  ghSigned: boolean;
  airlineSigned: boolean;
  airlineNamePresent: boolean;
  isFinalized: boolean;
}

export interface SignatureSectionProps {
  serialKey: string;
  isDark?: boolean;
  /** GH representative name — auto-filled from the authenticated user. */
  ghRepresentativeName: string;
  /** Airline representative name — from the Main Details form. */
  airlineRepresentativeName: string;
  /** Notifies the parent so it can gate Save / Generate PDF / Mark Complete. */
  onStateChange?: (state: SignatureSectionState) => void;
  onFinalized?: () => void;
}

function fmtTs(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd MMM yyyy, HH:mm');
}

export default function SignatureSection({
  serialKey,
  isDark = false,
  ghRepresentativeName,
  airlineRepresentativeName,
  onStateChange,
  onFinalized,
}: SignatureSectionProps) {
  const [view, setView] = useState<FhrSignatureView | null>(null);
  const [ghInk, setGhInk] = useState('');
  const [airlineInk, setAirlineInk] = useState('');
  const [savingParty, setSavingParty] = useState<FhrSignatureParty | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const saveTimers = useRef<Record<FhrSignatureParty, ReturnType<typeof setTimeout> | null>>({
    gh: null,
    airline: null,
  });

  const isFinalized = view?.isFinalized ?? false;
  const ghSignedAt = view?.signatures.ghSignedAt ?? null;
  const airlineSignedAt = view?.signatures.airlineSignedAt ?? null;
  const ghSigned = Boolean(ghInk) || Boolean(view?.signatures.ghSignatureUrl);
  const airlineSigned = Boolean(airlineInk) || Boolean(view?.signatures.airlineSignatureUrl);
  const airlineNamePresent = Boolean(airlineRepresentativeName.trim());

  // Load existing signatures.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const data = await fetchFhrSignatures(serialKey);
        if (!mounted || !data) return;
        setView(data);
        setGhInk(data.signatures.ghSignatureUrl || '');
        setAirlineInk(data.signatures.airlineSignatureUrl || '');
      } catch {
        /* draft not created yet — empty section */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [serialKey]);

  useEffect(() => {
    onStateChange?.({ ghSigned, airlineSigned, airlineNamePresent, isFinalized });
  }, [ghSigned, airlineSigned, airlineNamePresent, isFinalized, onStateChange]);

  const persist = useCallback(
    async (party: FhrSignatureParty, dataUrl: string) => {
      if (party === 'airline' && !airlineRepresentativeName.trim()) {
        toast.error('Enter the Airline Representative name before signing.');
        return;
      }
      setSavingParty(party);
      try {
        const next = await saveFhrSignature(serialKey, {
          party,
          signatureUrl: dataUrl,
          representativeName:
            party === 'gh' ? ghRepresentativeName : airlineRepresentativeName,
        });
        setView(next);
        toast.success(
          party === 'gh'
            ? 'GH signature saved'
            : 'Airline signature saved',
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save signature';
        if (/save main details first/i.test(msg)) {
          toast.error('Save Main Details first, then capture signatures.');
        } else {
          toast.error(msg);
        }
      } finally {
        setSavingParty(null);
      }
    },
    [serialKey, ghRepresentativeName, airlineRepresentativeName],
  );

  const scheduleSave = useCallback(
    (party: FhrSignatureParty, dataUrl: string) => {
      const timers = saveTimers.current;
      if (timers[party]) clearTimeout(timers[party]!);
      if (!dataUrl) return; // clearing does not delete the stored draft signature
      timers[party] = setTimeout(() => void persist(party, dataUrl), 700);
    },
    [persist],
  );

  useEffect(
    () => () => {
      const timers = saveTimers.current;
      if (timers.gh) clearTimeout(timers.gh);
      if (timers.airline) clearTimeout(timers.airline);
    },
    [],
  );

  const handleFinalize = useCallback(async () => {
    const problems: string[] = [];
    if (!ghSigned) problems.push('GH Representative signature is required.');
    if (!airlineNamePresent) problems.push('Airline Representative name is required.');
    if (!airlineSigned) problems.push('Airline Representative signature is required.');
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setIsFinalizing(true);
    try {
      const next = await finalizeFhr(serialKey);
      setView(next);
      toast.success('FHR digitally signed and finalized');
      onFinalized?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to finalize FHR');
    } finally {
      setIsFinalizing(false);
    }
  }, [ghSigned, airlineSigned, airlineNamePresent, serialKey, onFinalized]);

  const completion = useMemo(() => {
    let done = 0;
    if (ghSigned) done += 1;
    if (airlineSigned) done += 1;
    if (airlineNamePresent) done += 1;
    return Math.round((done / 3) * 100);
  }, [ghSigned, airlineSigned, airlineNamePresent]);

  const cardCls = isDark
    ? 'border-white/10 bg-white/[0.03]'
    : 'border-gray-200 bg-white';
  const labelCls = isDark ? 'text-slate-400' : 'text-gray-500';
  const valueCls = isDark ? 'text-slate-100' : 'text-gray-900';

  return (
    <section
      className={`rounded-xl border p-4 shadow-sm transition-all md:p-5 ${cardCls}`}
    >
      {/* Header */}
      <div className="mb-1 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm">
          <PenLine className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <h3 className={`text-base font-semibold ${valueCls}`}>Representative Signatures</h3>
          <p className={`text-xs ${labelCls}`}>
            Signatures can be added later by Employee, Manager, or Super Admin.
            They are required only when finalizing the FHR, not when saving other
            Main Details.
          </p>
        </div>
      </div>

      {/* Status card */}
      <div
        className={`mt-4 rounded-xl border p-3 ${
          isDark ? 'border-white/10 bg-[#0b101a]' : 'border-emerald-100 bg-emerald-50/40'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <StatusPill label="GH Representative" signed={ghSigned} isDark={isDark} />
            <StatusPill label="Airline Representative" signed={airlineSigned} isDark={isDark} />
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-28 overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className={`text-xs font-semibold tabular-nums ${valueCls}`}>{completion}%</span>
          </div>
        </div>
      </div>

      {isFinalized && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-2">
          <Lock className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-800">
            FHR Digitally Signed — editing is disabled.
          </p>
        </div>
      )}

      {/* Two signature panels */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SignaturePanel
          title="GH Representative"
          name={ghRepresentativeName || '—'}
          isDark={isDark}
          disabled={isFinalized}
          saving={savingParty === 'gh'}
          value={ghInk}
          signedAt={ghSignedAt}
          onChange={(v) => {
            setGhInk(v);
            scheduleSave('gh', v);
          }}
          onPreview={(v) => setPreview(v)}
        />
        <SignaturePanel
          title="Airline Representative"
          name={airlineRepresentativeName || '—'}
          nameMissing={!airlineNamePresent}
          isDark={isDark}
          disabled={isFinalized}
          saving={savingParty === 'airline'}
          value={airlineInk}
          signedAt={airlineSignedAt}
          onChange={(v) => {
            setAirlineInk(v);
            scheduleSave('airline', v);
          }}
          onPreview={(v) => setPreview(v)}
        />
      </div>

      {/* Finalize */}
      {!isFinalized ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dashed pt-4"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb' }}
        >
          <p className={`text-xs ${labelCls}`}>
            Finalizing digitally signs the FHR and locks both signatures.
          </p>
          <button
            type="button"
            onClick={() => void handleFinalize()}
            disabled={isFinalizing || !ghSigned || !airlineSigned || !airlineNamePresent}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFinalizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Mark Complete &amp; Finalize
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className={labelCls}>
            GH Signed At: <span className={`font-medium ${valueCls}`}>{fmtTs(ghSignedAt) || '—'}</span>
          </div>
          <div className={labelCls}>
            Airline Signed At: <span className={`font-medium ${valueCls}`}>{fmtTs(airlineSignedAt) || '—'}</span>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mb-3 text-sm font-semibold text-gray-900">Signature Preview</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Signature preview"
              className="w-full rounded-lg border border-gray-200 bg-white"
            />
          </div>
        </div>
      )}
    </section>
  );
}

function StatusPill({
  label,
  signed,
  isDark,
}: {
  label: string;
  signed: boolean;
  isDark: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {signed ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      ) : (
        <Clock className={`h-4 w-4 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
      )}
      <span className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
        {label}:
      </span>
      <span
        className={`text-xs font-semibold ${
          signed ? 'text-emerald-600' : isDark ? 'text-amber-400' : 'text-amber-600'
        }`}
      >
        {signed ? '✓ Signed' : '✗ Pending'}
      </span>
    </div>
  );
}

function SignaturePanel({
  title,
  name,
  nameMissing,
  isDark,
  disabled,
  saving,
  value,
  signedAt,
  onChange,
  onPreview,
}: {
  title: string;
  name: string;
  nameMissing?: boolean;
  isDark: boolean;
  disabled: boolean;
  saving: boolean;
  value: string;
  signedAt: string | null;
  onChange: (v: string) => void;
  onPreview: (v: string) => void;
}) {
  const labelCls = isDark ? 'text-slate-400' : 'text-gray-500';
  const valueCls = isDark ? 'text-slate-100' : 'text-gray-900';
  return (
    <div
      className={`rounded-xl border p-3 ${
        isDark ? 'border-white/10 bg-white/[0.02]' : 'border-gray-200 bg-gradient-to-br from-slate-50/60 to-white'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${labelCls}`}>{title}</p>
          <p className={`text-sm font-semibold ${nameMissing ? 'text-amber-600' : valueCls}`}>
            {nameMissing ? 'Name required' : name}
          </p>
        </div>
        {saving && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving
          </span>
        )}
      </div>
      <SignaturePad
        value={value}
        onChange={onChange}
        disabled={disabled}
        isDark={isDark}
        height={180}
        onPreview={onPreview}
      />
      <p className={`mt-2 text-xs ${labelCls}`}>
        Signed Timestamp:{' '}
        <span className={`font-medium ${valueCls}`}>{fmtTs(signedAt) || 'Not signed yet'}</span>
      </p>
    </div>
  );
}
