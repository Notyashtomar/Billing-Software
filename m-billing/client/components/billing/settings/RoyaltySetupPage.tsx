'use client';

import { useCallback, useEffect, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import type { BillingApi } from '@/lib/billing-api';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import { downloadMagRatesWorkbook, type AirportCommercial, type CeilingRate } from './AirportRulesWizard';

type Side = 'net' | 'gross';

type Concession = {
  percent: number;
  effectiveFrom: string;
  effectiveTo: string;
};

type RoyaltyMaster = {
  net?: Concession;
  gross?: Concession;
};

type Props = { api: BillingApi };

function dateInput(value: unknown): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function guideFor(ownership: AirportCommercial['ownership'] | undefined, mag: boolean): string {
  if (!ownership) {
    return 'Set the station as a private airport or an Airport Authority on Airport Setup first. The two cards stay the same on every station. Concession percentage and validity are saved here, and invoice generation does not use them yet.';
  }
  if (ownership === 'aai') {
    return 'This station is an Airport Authority. Each card asks only for a concession percentage and the dates it applies. MAG rates are not used. Saving here does not change invoice generation.';
  }
  if (mag) {
    return 'This station is a private airport with MAG rates applicable. Each card asks for a concession percentage and its validity. The MAG table is the workbook uploaded on Airport Setup. For a flight, the concession to use is the higher of this percentage and the MAG rate for that aircraft type and service. This screen only records the values. Invoice generation is unchanged.';
  }
  return 'This station is a private airport without MAG rates. Each card asks for a concession percentage and the dates it applies. Saving here does not change invoice generation.';
}

export function RoyaltySetupPage({ api }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [magOpen, setMagOpen] = useState(false);
  const [commercial, setCommercial] = useState<AirportCommercial | null>(null);
  const [master, setMaster] = useState<RoyaltyMaster>({});
  const [editing, setEditing] = useState<Side | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getSettings();
      const data = (res as { data?: { airportCommercial?: AirportCommercial; royaltyMaster?: RoyaltyMaster } })
        .data;
      setCommercial(data?.airportCommercial ?? null);
      const saved = data?.royaltyMaster ?? {};
      setMaster({
        net: saved.net
          ? { ...saved.net, effectiveFrom: dateInput(saved.net.effectiveFrom), effectiveTo: dateInput(saved.net.effectiveTo) }
          : undefined,
        gross: saved.gross
          ? {
              ...saved.gross,
              effectiveFrom: dateInput(saved.gross.effectiveFrom),
              effectiveTo: dateInput(saved.gross.effectiveTo),
            }
          : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load royalty master');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const mag = Boolean(commercial?.ownership === 'private' && commercial.minRevenueShareApplicable);
  const magRates = commercial?.ceilingRates ?? [];
  const hasMagRates = magRates.length > 0;
  const ownershipLabel =
    commercial?.ownership === 'private'
      ? 'Private airport'
      : commercial?.ownership === 'aai'
        ? 'Airport Authority'
        : 'Ownership not set';

  return (
    <div>
      <BillingPageHeader
        title="Royalty Setup"
        description="The same two cards on every station. Concession percentage and validity are saved per card."
        actions={
          <>
            <button
              type="button"
              disabled={!hasMagRates}
              aria-disabled={!hasMagRates}
              title={
                hasMagRates
                  ? 'View the MAG rates uploaded on Airport Setup'
                  : 'Upload MAG rates on Airport Setup to open this'
              }
              className={`${billingUi.btnSecondary} ${hasMagRates ? '' : 'opacity-40'}`}
              onClick={() => {
                if (!hasMagRates) return;
                setMagOpen(true);
              }}
            >
              MAG rates
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] text-sm font-semibold text-[color:var(--billing-heading)]"
              aria-expanded={guideOpen}
              aria-label="How this page works"
              onClick={() => setGuideOpen((open) => !open)}
            >
              i
            </button>
          </>
        }
      />

      {guideOpen ? (
        <section className={`${billingUi.card} mb-4 p-4 text-sm text-[color:var(--billing-text)]`}>
          <p className="font-semibold text-[color:var(--billing-heading)]">About this view</p>
          <p className="mt-2 text-[color:var(--billing-text-muted)]">
            {guideFor(commercial?.ownership, mag)} Current station setup: {ownershipLabel}
            {mag ? ' · MAG rates applicable' : ''}.
          </p>
        </section>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-accent-strong)]">
          {success}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[color:var(--billing-text-muted)]">Loading royalty master…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <RoyaltyCard
            title="Royalty on Net"
            concession={master.net}
            onOpen={() => {
              setSuccess('');
              setEditing('net');
            }}
          />
          <RoyaltyCard
            title="Royalty on Gross"
            concession={master.gross}
            onOpen={() => {
              setSuccess('');
              setEditing('gross');
            }}
          />
        </div>
      )}

      {editing ? (
        <RoyaltyForm
          side={editing}
          initial={master[editing]}
          showMag={mag}
          rates={magRates}
          onClose={() => setEditing(null)}
          onSave={async (concession) => {
            await api.updateSettings({
              royaltyMaster: { [editing]: concession },
            });
            setSuccess(
              editing === 'net' ? 'Royalty on Net saved.' : 'Royalty on Gross saved.',
            );
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {magOpen ? (
        <MagRatesDialog rates={magRates} onClose={() => setMagOpen(false)} />
      ) : null}
    </div>
  );
}

function MagRatesDialog({ rates, onClose }: { rates: CeilingRate[]; onClose: () => void }) {
  const [exporting, setExporting] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mag-rates-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 shadow-lg sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="mag-rates-title" className="text-base font-semibold text-[color:var(--billing-heading)]">
              MAG rates
            </h2>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              Uploaded on Airport Setup. For a flight, use the higher of the concession percentage and the MAG rate
              for that aircraft type and service. Invoice generation does not apply this yet.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={exporting}
              className={billingUi.btnSecondary}
              onClick={() => {
                setExporting(true);
                void downloadMagRatesWorkbook(rates, 'airport-mag-rates.xlsx').finally(() => setExporting(false));
              }}
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button type="button" className="text-sm text-[color:var(--billing-text-muted)]" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[color:var(--billing-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Aircraft type</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">MAG rate</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr key={`${rate.aircraftCode}-${rate.serviceType}`} className="border-t border-[color:var(--billing-border)]">
                  <td className="px-3 py-2 text-[color:var(--billing-heading)]">{rate.aircraftCode}</td>
                  <td className="px-3 py-2">{rate.serviceType}</td>
                  <td className="px-3 py-2">{rate.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoyaltyCard({
  title,
  concession,
  onOpen,
}: {
  title: string;
  concession?: Concession;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${billingUi.card} ${billingUi.tileGlow} p-5 text-left`}
    >
      <p className="text-base font-semibold text-[color:var(--billing-heading)]">{title}</p>
      {concession ? (
        <dl className="mt-3 grid gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--billing-text-muted)]">Concession</dt>
            <dd className="font-medium text-[color:var(--billing-heading)]">{concession.percent}%</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--billing-text-muted)]">Valid</dt>
            <dd className="font-medium text-[color:var(--billing-heading)]">
              {formatBillingDate(concession.effectiveFrom)} – {formatBillingDate(concession.effectiveTo)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[color:var(--billing-text-muted)]">
          No concession saved. Open this card to add a percentage and validity.
        </p>
      )}
    </button>
  );
}

function RoyaltyForm({
  side,
  initial,
  showMag,
  rates,
  onClose,
  onSave,
}: {
  side: Side;
  initial?: Concession;
  showMag: boolean;
  rates: CeilingRate[];
  onClose: () => void;
  onSave: (concession: Concession) => Promise<void>;
}) {
  const [percent, setPercent] = useState(initial?.percent != null ? String(initial.percent) : '');
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? '');
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const title = side === 'net' ? 'Royalty on Net' : 'Royalty on Gross';

  const save = async () => {
    setError('');
    const value = Number(percent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('Enter a concession percentage between 0 and 100.');
      return;
    }
    if (!effectiveFrom || !effectiveTo) {
      setError('Enter the effective date and the valid-till date.');
      return;
    }
    if (effectiveTo < effectiveFrom) {
      setError('Valid till must be on or after the effective date.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ percent: value, effectiveFrom, effectiveTo });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="royalty-form-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[color:var(--billing-border)] bg-white p-4 shadow-lg sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="royalty-form-title" className="text-base font-semibold text-[color:var(--billing-heading)]">
              {title}
            </h2>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              Concession percentage and the period it applies.
            </p>
          </div>
          <button type="button" className="text-sm text-[color:var(--billing-text-muted)]" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-[color:var(--billing-heading)]">
            Concession %
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              className="min-h-11 rounded-lg border border-[color:var(--billing-border)] px-3 font-normal"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-[color:var(--billing-heading)]">
              Effective from
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="min-h-11 rounded-lg border border-[color:var(--billing-border)] px-3 font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[color:var(--billing-heading)]">
              Valid till
              <input
                type="date"
                value={effectiveTo}
                onChange={(event) => setEffectiveTo(event.target.value)}
                className="min-h-11 rounded-lg border border-[color:var(--billing-border)] px-3 font-normal"
              />
            </label>
          </div>
        </div>

        {showMag ? (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-[color:var(--billing-heading)]">MAG rates</h3>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              Uploaded on Airport Setup. For a flight, use the higher of this concession percentage and the MAG rate
              for the aircraft type and the service on that flight. Invoice generation does not apply this yet.
            </p>
            {rates.length === 0 ? (
              <p className="mt-3 text-sm text-[color:var(--billing-text-muted)]">
                No MAG workbook has been uploaded for this station.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--billing-border)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Aircraft type</th>
                      <th className="px-3 py-2 font-medium">Service</th>
                      <th className="px-3 py-2 font-medium">MAG rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((rate) => (
                      <tr key={`${rate.aircraftCode}-${rate.serviceType}`} className="border-t border-[color:var(--billing-border)]">
                        <td className="px-3 py-2">{rate.aircraftCode}</td>
                        <td className="px-3 py-2">{rate.serviceType}</td>
                        <td className="px-3 py-2">{rate.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-10 rounded-lg border border-[color:var(--billing-border)] px-3 text-sm font-semibold"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="min-h-10 rounded-lg bg-[color:var(--billing-primary)] px-3 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
