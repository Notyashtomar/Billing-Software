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
  Eye,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  assignFhrSignature,
  fetchResolvedFhrSignatures,
  finalizeFhr,
  lookupRepresentativeSignature,
  saveFhrSignature,
  type FhrSignatureParty,
  type RepresentativeSignatureRecord,
  type RepresentativeType,
  type ResolvedFhrSignatures,
} from '@/lib/api';
import SignaturePad from './SignaturePad';

export interface SignatureSectionState {
  ghSigned: boolean;
  airlineSigned: boolean;
  airlineNamePresent: boolean;
  isFinalized: boolean;
}

export interface DigitalSignaturesSectionProps {
  serialKey: string;
  isDark?: boolean;
  /** GH representative name — auto-filled from the authenticated user. */
  ghRepresentativeName: string;
  /** Airline representative name — from the Main Details form (optional for NS). */
  airlineRepresentativeName: string;
  /**
   * When true (Non-Scheduled Main Details), airline does not need a name set in
   * Main Details — signer types any name in the signature modal before saving.
   */
  airlineNameOptional?: boolean;
  onStateChange?: (state: SignatureSectionState) => void;
  onFinalized?: () => void;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd MMM yyyy, HH:mm');
}

const PARTY_META: Record<
  FhrSignatureParty,
  { title: string; type: RepresentativeType }
> = {
  gh: { title: 'GH Representative', type: 'GH_REPRESENTATIVE' },
  airline: { title: 'Airline Representative', type: 'AIRLINE_REPRESENTATIVE' },
};

export default function DigitalSignaturesSection({
  serialKey,
  isDark = false,
  ghRepresentativeName,
  airlineRepresentativeName,
  airlineNameOptional = false,
  onStateChange,
  onFinalized,
}: DigitalSignaturesSectionProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<ResolvedFhrSignatures | null>(null);
  const [existing, setExisting] = useState<
    Record<FhrSignatureParty, RepresentativeSignatureRecord | null>
  >({ gh: null, airline: null });
  const [mode, setMode] = useState<Record<FhrSignatureParty, 'view' | 'draw'>>({
    gh: 'view',
    airline: 'view',
  });
  const [ink, setInk] = useState<Record<FhrSignatureParty, string>>({
    gh: '',
    airline: '',
  });
  const [busy, setBusy] = useState<FhrSignatureParty | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // Prevents overlapping refresh() runs from issuing duplicate auto-apply writes.
  const refreshingRef = useRef(false);
  /** Free-text airline name when Main Details does not supply one (NS). */
  const [airlineNameDraft, setAirlineNameDraft] = useState('');

  const names: Record<FhrSignatureParty, string> = useMemo(
    () => ({
      gh: ghRepresentativeName.trim(),
      airline: airlineNameOptional
        ? airlineNameDraft.trim() || airlineRepresentativeName.trim()
        : airlineRepresentativeName.trim(),
    }),
    [
      ghRepresentativeName,
      airlineRepresentativeName,
      airlineNameOptional,
      airlineNameDraft,
    ],
  );

  const isFinalized = resolved?.isFinalized ?? false;
  const ghAssigned = Boolean(resolved?.gh.signatureUrl);
  const airlineAssigned = Boolean(resolved?.airline.signatureUrl);
  // NS: name can be entered at sign time; treat assigned airline sig as name OK for finalize.
  const airlineNamePresent = airlineNameOptional
    ? Boolean(names.airline) || airlineAssigned
    : Boolean(names.airline);

  // Lightweight state load on mount (drives the parent's gating + banners).
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const r = await fetchResolvedFhrSignatures(serialKey);
        if (mounted) setResolved(r);
      } catch {
        /* draft not created yet */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [serialKey]);

  useEffect(() => {
    onStateChange?.({
      ghSigned: ghAssigned,
      airlineSigned: airlineAssigned,
      airlineNamePresent,
      isFinalized,
    });
  }, [ghAssigned, airlineAssigned, airlineNamePresent, isFinalized, onStateChange]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      let r = await fetchResolvedFhrSignatures(serialKey).catch(() => null);
      const [gh, airline] = await Promise.all([
        names.gh
          ? lookupRepresentativeSignature(names.gh, 'GH_REPRESENTATIVE').catch(
              () => null,
            )
          : Promise.resolve(null),
        names.airline
          ? lookupRepresentativeSignature(
              names.airline,
              'AIRLINE_REPRESENTATIVE',
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      // Auto-load: apply reusable signatures that exist in the repository but
      // aren't yet applied to this FHR (sign once → auto-fetch on future reports).
      if (!r?.isFinalized) {
        const pending: Array<{ party: FhrSignatureParty; id: string }> = [];
        if (gh && !r?.gh.signatureUrl) pending.push({ party: 'gh', id: gh.id });
        if (airline && !r?.airline.signatureUrl)
          pending.push({ party: 'airline', id: airline.id });
        if (pending.length) {
          let applied = false;
          for (const p of pending) {
            try {
              await assignFhrSignature(serialKey, p.party, p.id);
              applied = true;
            } catch {
              /* draft not saved yet — ignore */
            }
          }
          if (applied) r = await fetchResolvedFhrSignatures(serialKey).catch(() => r);
        }
      }

      setResolved(r);
      setExisting({ gh, airline });
      if (airlineNameOptional) {
        const assignedAirlineName = String(r?.airline?.name ?? '').trim();
        if (assignedAirlineName) {
          setAirlineNameDraft((prev) => prev.trim() || assignedAirlineName);
        }
      }
      setMode({
        gh: gh || r?.gh.signatureUrl ? 'view' : 'draw',
        airline: airline || r?.airline.signatureUrl ? 'view' : 'draw',
      });
      setInk({ gh: '', airline: '' });
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, [serialKey, names.gh, names.airline, airlineNameOptional]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    void refresh();
  }, [refresh]);

  const handleUseExisting = useCallback(
    async (party: FhrSignatureParty) => {
      const rec = existing[party];
      if (!rec) return;
      setBusy(party);
      try {
        await assignFhrSignature(serialKey, party, rec.id);
        toast.success(`${PARTY_META[party].title} signature applied`);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to apply signature');
      } finally {
        setBusy(null);
      }
    },
    [existing, serialKey, refresh],
  );

  const handleSaveDrawn = useCallback(
    async (party: FhrSignatureParty) => {
      const dataUrl = ink[party];
      if (!dataUrl) {
        toast.error('Draw a signature before saving.');
        return;
      }
      if (!names[party]) {
        toast.error(
          party === 'gh'
            ? 'Select the GH Representative in Main Details before signing.'
            : airlineNameOptional
              ? 'Enter the Airline Representative name before signing.'
              : 'Select the Airline Representative in Main Details before signing.',
        );
        return;
      }
      setBusy(party);
      try {
        await saveFhrSignature(serialKey, {
          party,
          signatureUrl: dataUrl,
          representativeName: names[party],
        });
        toast.success(`${PARTY_META[party].title} signature saved`);
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save signature';
        toast.error(
          /save main details first/i.test(msg)
            ? 'Save Main Details first, then capture signatures.'
            : msg,
        );
      } finally {
        setBusy(null);
      }
    },
    [ink, names, serialKey, refresh, airlineNameOptional],
  );

  const handleFinalize = useCallback(async () => {
    const problems: string[] = [];
    if (!ghAssigned) problems.push('GH Representative signature is required.');
    if (!airlineNameOptional && !airlineNamePresent) {
      problems.push('Airline Representative name is required.');
    }
    if (airlineNameOptional && !airlineAssigned && !names.airline) {
      problems.push('Enter an Airline Representative name and save the signature.');
    }
    if (!airlineAssigned) problems.push('Airline Representative signature is required.');
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setFinalizing(true);
    try {
      await finalizeFhr(serialKey);
      toast.success('FHR digitally signed and finalized');
      await refresh();
      onFinalized?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to finalize FHR');
    } finally {
      setFinalizing(false);
    }
  }, [
    ghAssigned,
    airlineAssigned,
    airlineNamePresent,
    airlineNameOptional,
    names.airline,
    serialKey,
    refresh,
    onFinalized,
  ]);

  const completion = useMemo(() => {
    let done = 0;
    const total = airlineNameOptional ? 2 : 3;
    if (ghAssigned) done += 1;
    if (airlineAssigned) done += 1;
    if (!airlineNameOptional && airlineNamePresent) done += 1;
    return Math.round((done / total) * 100);
  }, [ghAssigned, airlineAssigned, airlineNamePresent, airlineNameOptional]);

  const cardCls = isDark
    ? 'border-white/10 bg-white/[0.03]'
    : 'border-gray-200 bg-white';
  const labelCls = isDark ? 'text-slate-400' : 'text-gray-500';
  const valueCls = isDark ? 'text-slate-100' : 'text-gray-900';

  return (
    <section className={`rounded-xl border p-4 shadow-sm md:p-5 ${cardCls}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm">
            <PenLine className="h-[18px] w-[18px] text-white" />
          </div>
          <div>
            <h3 className={`text-base font-semibold ${valueCls}`}>
              Representative Signatures
            </h3>
            <p className={`text-xs ${labelCls}`}>
              Reusable digital signatures for FHR, GSE &amp; Team reports.
              Employee, Manager, and Super Admin can open and sign.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-emerald-700"
        >
          {isFinalized ? <Lock className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
          Digital Signatures
        </button>
      </div>

      {/* Status summary */}
      <div
        className={`mt-4 rounded-xl border p-3 ${
          isDark ? 'border-white/10 bg-[#0b101a]' : 'border-emerald-100 bg-emerald-50/40'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <StatusPill label="GH Representative" signed={ghAssigned} isDark={isDark} />
            <StatusPill
              label="Airline Representative"
              signed={airlineAssigned}
              isDark={isDark}
            />
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-28 overflow-hidden rounded-full ${
                isDark ? 'bg-white/10' : 'bg-gray-200'
              }`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className={`text-xs font-semibold tabular-nums ${valueCls}`}>
              {completion}%
            </span>
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

      {open && (
        <DigitalSignaturesModal
          isDark={isDark}
          loading={loading}
          resolved={resolved}
          existing={existing}
          mode={mode}
          ink={ink}
          busy={busy}
          finalizing={finalizing}
          names={names}
          isFinalized={isFinalized}
          ghAssigned={ghAssigned}
          airlineAssigned={airlineAssigned}
          airlineNamePresent={airlineNamePresent}
          airlineNameOptional={airlineNameOptional}
          airlineNameDraft={airlineNameDraft}
          onAirlineNameDraftChange={setAirlineNameDraft}
          onClose={() => setOpen(false)}
          onRefresh={() => void refresh()}
          onUseExisting={(p) => void handleUseExisting(p)}
          onSaveDrawn={(p) => void handleSaveDrawn(p)}
          onReplace={(p) => {
            setMode((m) => ({ ...m, [p]: 'draw' }));
            setInk((i) => ({ ...i, [p]: '' }));
          }}
          onCancelReplace={(p) =>
            setMode((m) => ({
              ...m,
              [p]: existing[p] || resolved?.[p].signatureUrl ? 'view' : 'draw',
            }))
          }
          onInkChange={(p, v) => setInk((i) => ({ ...i, [p]: v }))}
          onPreview={(url) => setPreview(url)}
          onFinalize={() => void handleFinalize()}
        />
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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

// ---------------------------------------------------------------------------

interface ModalProps {
  isDark: boolean;
  loading: boolean;
  resolved: ResolvedFhrSignatures | null;
  existing: Record<FhrSignatureParty, RepresentativeSignatureRecord | null>;
  mode: Record<FhrSignatureParty, 'view' | 'draw'>;
  ink: Record<FhrSignatureParty, string>;
  busy: FhrSignatureParty | null;
  finalizing: boolean;
  names: Record<FhrSignatureParty, string>;
  isFinalized: boolean;
  ghAssigned: boolean;
  airlineAssigned: boolean;
  airlineNamePresent: boolean;
  airlineNameOptional: boolean;
  airlineNameDraft: string;
  onAirlineNameDraftChange: (value: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  onUseExisting: (p: FhrSignatureParty) => void;
  onSaveDrawn: (p: FhrSignatureParty) => void;
  onReplace: (p: FhrSignatureParty) => void;
  onCancelReplace: (p: FhrSignatureParty) => void;
  onInkChange: (p: FhrSignatureParty, v: string) => void;
  onPreview: (url: string) => void;
  onFinalize: () => void;
}

function DigitalSignaturesModal(props: ModalProps) {
  const { isDark, onClose } = props;
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panelCls = isDark ? 'bg-[#0c121d] text-slate-100' : 'bg-white text-gray-900';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[350] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`relative my-auto w-full max-w-3xl rounded-2xl shadow-2xl ${panelCls}`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 rounded-t-2xl border-b px-5 py-4 ${
            isDark ? 'border-white/10' : 'border-gray-100'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Digital Signatures</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                Sign once — signatures are reused across future reports.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={props.onRefresh}
              disabled={props.loading}
              className={`rounded-lg p-2 ${
                isDark ? 'text-slate-300 hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100'
              }`}
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${props.loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg p-2 ${
                isDark ? 'text-slate-300 hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100'
              }`}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {props.loading && !props.resolved ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : (
            <div className="space-y-5">
              <RepresentativeCard party="gh" step={1} {...props} />
              <div
                className={`h-px w-full ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}
                aria-hidden
              />
              <RepresentativeCard party="airline" step={2} {...props} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t px-5 py-4 ${
            isDark ? 'border-white/10' : 'border-gray-100'
          }`}
        >
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {props.isFinalized
              ? 'This FHR is finalized and digitally signed.'
              : 'Save Main Details anytime. Add both signatures, then finalize when ready.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                isDark
                  ? 'border border-white/15 text-slate-200 hover:bg-white/10'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Close
            </button>
            {!props.isFinalized && (
              <button
                type="button"
                onClick={props.onFinalize}
                disabled={
                  props.finalizing ||
                  !props.ghAssigned ||
                  !props.airlineAssigned ||
                  (!props.airlineNameOptional && !props.airlineNamePresent)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {props.finalizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Mark Complete &amp; Finalize
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RepresentativeCard({
  party,
  step,
  ...props
}: { party: FhrSignatureParty; step: number } & ModalProps) {
  const {
    isDark,
    resolved,
    existing,
    mode,
    ink,
    busy,
    names,
    isFinalized,
    airlineNameOptional,
    airlineNameDraft,
    onAirlineNameDraftChange,
    onUseExisting,
    onSaveDrawn,
    onReplace,
    onCancelReplace,
    onInkChange,
    onPreview,
  } = props;

  const meta = PARTY_META[party];
  const name = names[party];
  const assigned = resolved?.[party] ?? null;
  const assignedUrl = assigned?.signatureUrl || '';
  const repoExisting = existing[party];
  const reuseUrl = repoExisting?.signatureUrl || '';
  const signedAt = assigned?.signedAt ?? null;
  const cardMode = mode[party];
  const working = busy === party;

  const labelCls = isDark ? 'text-slate-400' : 'text-gray-500';
  const valueCls = isDark ? 'text-slate-100' : 'text-gray-900';
  // Distinct accent per representative so the two sections read as separate.
  const accent =
    party === 'gh'
      ? { ring: 'ring-emerald-500/30', badge: 'from-emerald-500 to-emerald-600', chip: isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700' }
      : { ring: 'ring-sky-500/30', badge: 'from-sky-500 to-indigo-600', chip: isDark ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-50 text-sky-700' };
  const subCardCls = isDark
    ? `border-white/10 bg-white/[0.02] ring-1 ${accent.ring}`
    : `border-gray-200 bg-gradient-to-br from-slate-50/60 to-white ring-1 ${accent.ring}`;

  // Show preview when there is a signature to reuse OR one already assigned.
  const previewUrl = assignedUrl || reuseUrl;
  const hasSignature = Boolean(previewUrl);
  const showDraw = cardMode === 'draw' && !isFinalized;

  const allowFreeAirlineName = party === 'airline' && airlineNameOptional;
  const nameMissing = allowFreeAirlineName ? !name : !name;
  const nameHint = allowFreeAirlineName
    ? name || 'Enter any name below to sign'
    : nameMissing
      ? 'Name required (set in Main Details)'
      : name || '—';

  return (
    <div className={`rounded-xl border p-4 ${subCardCls}`}>
      {/* Section header band */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${accent.badge} text-xs font-bold text-white shadow-sm`}
          >
            {step}
          </span>
          <div>
            <p className={`text-sm font-bold ${valueCls}`}>{meta.title}</p>
            <p
              className={`text-xs font-medium ${
                nameMissing && !allowFreeAirlineName ? 'text-amber-600' : labelCls
              }`}
            >
              {nameHint}
            </p>
          </div>
        </div>
        {hasSignature && !showDraw ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Signature Available
          </span>
        ) : (
          !isFinalized && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent.chip}`}
            >
              <PenLine className="h-3.5 w-3.5" /> Sign here
            </span>
          )
        )}
      </div>

      {allowFreeAirlineName && !isFinalized && (
        <div className="mb-3">
          <label
            htmlFor="ns-airline-rep-name"
            className={`mb-1 block text-xs font-medium ${labelCls}`}
          >
            Airline representative name
          </label>
          <input
            id="ns-airline-rep-name"
            type="text"
            value={airlineNameDraft}
            onChange={(e) => onAirlineNameDraftChange(e.target.value)}
            placeholder="Type any name"
            disabled={Boolean(assignedUrl) && !showDraw}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${
              isDark
                ? 'border-white/15 bg-white/5 text-slate-100 placeholder:text-slate-500'
                : 'border-gray-200 bg-white text-gray-900 placeholder:text-gray-400'
            } focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60`}
            autoComplete="off"
          />
        </div>
      )}

      {hasSignature && !showDraw ? (
        <>
          <div
            className={`flex items-center justify-center rounded-lg border p-2 ${
              isDark ? 'border-white/10 bg-white' : 'border-gray-200 bg-white'
            }`}
            style={{ minHeight: 110 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`${meta.title} signature`}
              className="max-h-[110px] w-auto object-contain"
            />
          </div>

          <p className={`mt-2 text-xs ${labelCls}`}>
            Signed On:{' '}
            <span className={`font-medium ${valueCls}`}>
              {fmtTs(signedAt) || (assignedUrl ? '—' : 'Not applied yet')}
            </span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!assignedUrl && reuseUrl && !isFinalized && (
              <button
                type="button"
                onClick={() => onUseExisting(party)}
                disabled={working || nameMissing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60"
              >
                {working ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Use Existing Signature
              </button>
            )}
            {assignedUrl && !isFinalized && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Applied to this FHR
              </span>
            )}
            <button
              type="button"
              onClick={() => onPreview(previewUrl)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                isDark
                  ? 'border border-white/15 text-slate-200 hover:bg-white/10'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Eye className="h-3.5 w-3.5" /> View
            </button>
            {!isFinalized && (
              <button
                type="button"
                onClick={() => onReplace(party)}
                disabled={working}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  isDark
                    ? 'border border-white/15 text-slate-200 hover:bg-white/10'
                    : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Replace Signature
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <SignaturePad
            value={ink[party]}
            onChange={(v) => onInkChange(party, v)}
            isDark={isDark}
            height={160}
            disabled={isFinalized || nameMissing}
            placeholder={
              nameMissing
                ? allowFreeAirlineName
                  ? 'Enter name above, then draw'
                  : 'Enter representative name first'
                : 'Draw signature here'
            }
            onPreview={(v) => v && onPreview(v)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSaveDrawn(party)}
              disabled={working || isFinalized || nameMissing || !ink[party]}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60"
            >
              {working ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PenLine className="h-3.5 w-3.5" />
              )}
              Save Signature
            </button>
            {hasSignature && (
              <button
                type="button"
                onClick={() => onCancelReplace(party)}
                disabled={working}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  isDark
                    ? 'border border-white/15 text-slate-200 hover:bg-white/10'
                    : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
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
      <span
        className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'}`}
      >
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
