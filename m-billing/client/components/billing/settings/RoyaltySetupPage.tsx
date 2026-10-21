'use client';

import { useCallback, useEffect, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import type { BillingApi } from '@/lib/billing-api';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import {
  downloadMagRatesWorkbook,
  formatMagRate,
  magCurrencyName,
  magCurrencySymbol,
  parseMagRateInput,
  type AirportCommercial,
  type CeilingRate,
  type MagCurrency,
} from './AirportRulesWizard';

type Side = 'net' | 'gross';
type ConcessionKind = 'scheduledInternational' | 'scheduledDomestic' | 'generalAviation';

const CONCESSION_KINDS: { key: ConcessionKind; label: string }[] = [
  { key: 'scheduledInternational', label: 'Concession fee for Scheduled International flights' },
  { key: 'scheduledDomestic', label: 'Concession fee for Scheduled Domestic flights' },
  { key: 'generalAviation', label: 'Concession fee for General Aviation flights' },
];

type Fee = {
  percent: number;
};

type SideConcessions = {
  effectiveFrom?: string;
  effectiveTo?: string;
} & Partial<Record<ConcessionKind, Fee>>;

type RoyaltyMaster = {
  net?: SideConcessions;
  gross?: SideConcessions;
};

type Props = { api: BillingApi };

function dateInput(value: unknown): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function guideFor(
  ownership: AirportCommercial['ownership'] | undefined,
  mechanism: Side | undefined,
  mag: boolean,
): string {
  const fees =
    'Each card asks for a concession fee for scheduled international flights, scheduled domestic flights, and general aviation flights. Those three fees share one validity. Invoices use the fee that matches each flight category. Domestic and international flights are raised as separate invoices.';
  if (!ownership) {
    return `Set the station as a private airport or an Airport Authority on Airport Setup first. ${fees}`;
  }
  if (ownership === 'aai') {
    return `This station is an Airport Authority. Both royalty cards are shown. ${fees} MAG rates are not used.`;
  }
  const chosen = mechanism === 'net' ? 'Royalty on Net' : mechanism === 'gross' ? 'Royalty on Gross' : '';
  if (!chosen) {
    return 'This station is a private airport. Choose Royalty on Net or Royalty on Gross in Configure rules on Airport Setup. Only that card appears here.';
  }
  if (mag) {
    return `This station is a private airport with ${chosen} and MAG rates applicable. Only that card is shown. ${fees} The MAG table is the workbook uploaded on Airport Setup. For a flight, the concession to use is the higher of the matching fee and the MAG rate for that aircraft type and service.`;
  }
  return `This station is a private airport with ${chosen}. Only that card is shown. ${fees}`;
}

function readPercent(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const percent = Number((value as { percent?: unknown }).percent);
  return Number.isFinite(percent) ? percent : undefined;
}

function readSide(value: unknown): SideConcessions | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const side: SideConcessions = {};
  let effectiveFrom = dateInput(row.effectiveFrom);
  let effectiveTo = dateInput(row.effectiveTo);
  for (const kind of CONCESSION_KINDS) {
    const raw = row[kind.key];
    const percent = readPercent(raw);
    if (percent != null) side[kind.key] = { percent };
    if (raw && typeof raw === 'object') {
      const nested = raw as Record<string, unknown>;
      effectiveFrom = effectiveFrom || dateInput(nested.effectiveFrom);
      effectiveTo = effectiveTo || dateInput(nested.effectiveTo);
    }
  }
  if (effectiveFrom) side.effectiveFrom = effectiveFrom;
  if (effectiveTo) side.effectiveTo = effectiveTo;
  return side.effectiveFrom || side.effectiveTo || CONCESSION_KINDS.some((kind) => side[kind.key])
    ? side
    : undefined;
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
        net: readSide(saved.net),
        gross: readSide(saved.gross),
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
  const magCurrency: MagCurrency = commercial?.magCurrency ?? 'INR';
  const hasMagRates = magRates.length > 0;
  const mechanism: Side | undefined =
    commercial?.ownership === 'private' &&
    (commercial.revenueShareMechanism === 'net' || commercial.revenueShareMechanism === 'gross')
      ? commercial.revenueShareMechanism
      : undefined;
  const visibleSides: Side[] =
    commercial?.ownership === 'aai' ? ['net', 'gross'] : mechanism ? [mechanism] : [];
  const ownershipLabel =
    commercial?.ownership === 'private'
      ? 'Private airport'
      : commercial?.ownership === 'aai'
        ? 'Airport Authority'
        : 'Ownership not set';
  const mechanismLabel = mechanism === 'net' ? 'Royalty on Net' : mechanism === 'gross' ? 'Royalty on Gross' : '';

  return (
    <div>
      <BillingPageHeader
        title="Royalty Setup"
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
            {guideFor(commercial?.ownership, mechanism, mag)} Current station setup: {ownershipLabel}
            {mechanismLabel ? ` · ${mechanismLabel}` : ''}
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
        visibleSides.length === 0 ? (
          <section className={`${billingUi.card} p-5 text-sm text-[color:var(--billing-text-muted)]`}>
            {commercial?.ownership === 'private'
              ? 'Choose Royalty on Net or Royalty on Gross in Configure rules on Airport Setup. Only that card is shown here.'
              : 'Set this station on Airport Setup before adding royalty concession fees.'}
          </section>
        ) : (
          <div className={`grid gap-4 ${visibleSides.length > 1 ? 'md:grid-cols-2' : 'max-w-xl'}`}>
            {visibleSides.map((side) => (
              <RoyaltyCard
                key={side}
                title={side === 'net' ? 'Royalty on Net' : 'Royalty on Gross'}
                concessions={master[side]}
                onOpen={() => {
                  setSuccess('');
                  setEditing(side);
                }}
              />
            ))}
          </div>
        )
      )}

      {editing ? (
        <RoyaltyForm
          side={editing}
          initial={master[editing]}
          showMag={mag}
          rates={magRates}
          currency={magCurrency}
          onClose={() => setEditing(null)}
          onSave={async (concessions) => {
            await api.updateSettings({
              royaltyMaster: { [editing]: concessions },
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
        <MagRatesDialog
          api={api}
          commercial={commercial}
          rates={magRates}
          currency={magCurrency}
          onClose={() => setMagOpen(false)}
          onChanged={(next) => {
            setCommercial((current) => (current ? { ...current, ceilingRates: next } : current));
          }}
        />
      ) : null}
    </div>
  );
}

function rateDraft(amount: number, currency: MagCurrency): string {
  if (currency === 'INR') return String(Math.round(amount));
  const rounded = Math.round(amount * 100) / 100;
  return Math.abs(rounded - Math.trunc(rounded)) < 1e-9 ? String(rounded) : rounded.toFixed(2);
}

function MagRatesDialog({
  api,
  commercial,
  rates,
  currency,
  onClose,
  onChanged,
}: {
  api: BillingApi;
  commercial: AirportCommercial | null;
  rates: CeilingRate[];
  currency: MagCurrency;
  onClose: () => void;
  onChanged: (next: CeilingRate[]) => void;
}) {
  const [rows, setRows] = useState(rates);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [rowError, setRowError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const persist = async (next: CeilingRate[]) => {
    if (!commercial) return;
    setSaving(true);
    setRowError('');
    try {
      await api.updateSettings({
        airportCommercial: {
          ownership: commercial.ownership,
          revenueShareMechanism: commercial.revenueShareMechanism,
          minRevenueShareApplicable: true,
          magCurrency: currency,
          ceilingRates: next,
        },
      });
      setRows(next);
      setEditingIndex(null);
      onChanged(next);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not save MAG rates');
    } finally {
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
        aria-labelledby="mag-rates-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 shadow-lg sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="mag-rates-title" className="text-base font-semibold text-[color:var(--billing-heading)]">
              MAG rates
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={exporting}
              className={billingUi.btnSecondary}
              onClick={() => {
                setExporting(true);
                void downloadMagRatesWorkbook(rows, 'airport-mag-rates.xlsx', currency).finally(() => setExporting(false));
              }}
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button type="button" className="text-sm text-[color:var(--billing-text-muted)]" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {rowError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {rowError}
          </p>
        ) : null}
        <div className="mt-4 overflow-x-auto rounded-lg border border-[color:var(--billing-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Aircraft type</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">MAG rate ({magCurrencySymbol(currency)})</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-t border-[color:var(--billing-border)]">
                  <td colSpan={4} className="px-3 py-3 text-[color:var(--billing-text-muted)]">
                    No MAG rates.
                  </td>
                </tr>
              ) : (
                rows.map((rate, index) => (
                  <tr key={`${rate.aircraftCode}-${rate.serviceType}-${index}`} className="border-t border-[color:var(--billing-border)]">
                    <td className="px-3 py-2 text-[color:var(--billing-heading)]">{rate.aircraftCode}</td>
                    <td className="px-3 py-2">{rate.serviceType}</td>
                    <td className="px-3 py-2">
                      {editingIndex === index ? (
                        <input
                          type="number"
                          min={0}
                          step={currency === 'INR' ? '1' : '0.01'}
                          value={draft}
                          disabled={saving}
                          aria-label={`MAG rate for ${rate.aircraftCode} ${rate.serviceType}`}
                          onChange={(event) => setDraft(event.target.value)}
                          className="min-h-9 w-36 rounded-lg border border-[color:var(--billing-border)] px-2"
                        />
                      ) : (
                        formatMagRate(rate.amount, currency)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editingIndex === index ? (
                        <span className="inline-flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            className="text-sm font-semibold text-[color:var(--billing-heading)] disabled:opacity-50"
                            onClick={() => {
                              const parsed = parseMagRateInput(draft, currency);
                              if ('error' in parsed) {
                                setRowError(parsed.error);
                                return;
                              }
                              const next = rows.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, amount: parsed.amount } : row,
                              );
                              void persist(next);
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            className="text-sm font-semibold text-[color:var(--billing-text-muted)] disabled:opacity-50"
                            onClick={() => {
                              setEditingIndex(null);
                              setRowError('');
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={saving || editingIndex != null}
                            className="text-sm font-semibold text-[color:var(--billing-heading)] disabled:opacity-50"
                            onClick={() => {
                              setRowError('');
                              setEditingIndex(index);
                              setDraft(rateDraft(rate.amount, currency));
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={saving || editingIndex != null}
                            className="text-sm font-semibold text-red-700 disabled:opacity-50"
                            onClick={() => {
                              if (!window.confirm(`Delete the MAG rate for ${rate.aircraftCode} / ${rate.serviceType}?`)) {
                                return;
                              }
                              void persist(rows.filter((_, rowIndex) => rowIndex !== index));
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoyaltyCard({
  title,
  concessions,
  onOpen,
}: {
  title: string;
  concessions?: SideConcessions;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${billingUi.card} ${billingUi.tileGlow} p-5 text-left`}
    >
      <p className="text-base font-semibold text-[color:var(--billing-heading)]">{title}</p>
      <dl className="mt-3 grid gap-3 text-sm">
        {CONCESSION_KINDS.map((kind) => {
          const concession = concessions?.[kind.key];
          return (
            <div key={kind.key} className="flex items-baseline justify-between gap-4">
              <dt className="text-[color:var(--billing-text-muted)]">{kind.label}</dt>
              <dd className="shrink-0 text-right font-medium text-[color:var(--billing-heading)]">
                {concession ? `${concession.percent}%` : 'Not set'}
              </dd>
            </div>
          );
        })}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-[color:var(--billing-text-muted)]">Valid</dt>
          <dd className="shrink-0 text-right font-medium text-[color:var(--billing-heading)]">
            {concessions?.effectiveFrom && concessions.effectiveTo
              ? `${formatBillingDate(concessions.effectiveFrom)} – ${formatBillingDate(concessions.effectiveTo)}`
              : 'Not set'}
          </dd>
        </div>
      </dl>
    </button>
  );
}

function RoyaltyForm({
  side,
  initial,
  showMag,
  rates,
  currency,
  onClose,
  onSave,
}: {
  side: Side;
  initial?: SideConcessions;
  showMag: boolean;
  rates: CeilingRate[];
  currency: MagCurrency;
  onClose: () => void;
  onSave: (
    concessions: { effectiveFrom: string; effectiveTo: string } & Record<ConcessionKind, Fee>,
  ) => Promise<void>;
}) {
  const [percents, setPercents] = useState<Record<ConcessionKind, string>>(() => ({
    scheduledInternational:
      initial?.scheduledInternational?.percent != null ? String(initial.scheduledInternational.percent) : '',
    scheduledDomestic: initial?.scheduledDomestic?.percent != null ? String(initial.scheduledDomestic.percent) : '',
    generalAviation: initial?.generalAviation?.percent != null ? String(initial.generalAviation.percent) : '',
  }));
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? '');
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const title = side === 'net' ? 'Royalty on Net' : 'Royalty on Gross';

  const save = async () => {
    setError('');
    const concessions = {
      effectiveFrom,
      effectiveTo,
    } as { effectiveFrom: string; effectiveTo: string } & Record<ConcessionKind, Fee>;
    for (const kind of CONCESSION_KINDS) {
      const value = Number(percents[kind.key]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setError(`Enter a percentage between 0 and 100 for ${kind.label}.`);
        return;
      }
      concessions[kind.key] = { percent: value };
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
      await onSave(concessions);
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
              Three concession fees at this station, with one validity for all of them.
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

        <div className="mt-4 grid gap-4">
          {CONCESSION_KINDS.map((kind) => (
            <label key={kind.key} className="grid gap-1 text-sm font-medium text-[color:var(--billing-heading)]">
              {kind.label}
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={percents[kind.key]}
                onChange={(event) =>
                  setPercents((current) => ({ ...current, [kind.key]: event.target.value }))
                }
                placeholder="Concession %"
                className="min-h-11 rounded-lg border border-[color:var(--billing-border)] px-3 font-normal"
              />
            </label>
          ))}
          <fieldset className="grid gap-3 rounded-lg border border-[color:var(--billing-border)] p-3">
            <legend className="px-1 text-sm font-semibold text-[color:var(--billing-heading)]">
              Validity for all concession fees
            </legend>
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
          </fieldset>
        </div>

        {showMag ? (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-[color:var(--billing-heading)]">MAG rates</h3>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              Currency: {magCurrencyName(currency)} ({magCurrencySymbol(currency)}). Uploaded on Airport Setup. For a flight, use the higher of the concession fee for that flight type and the MAG rate
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
                      <th className="px-3 py-2 font-medium">MAG rate ({magCurrencySymbol(currency)})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((rate) => (
                      <tr key={`${rate.aircraftCode}-${rate.serviceType}`} className="border-t border-[color:var(--billing-border)]">
                        <td className="px-3 py-2">{rate.aircraftCode}</td>
                        <td className="px-3 py-2">{rate.serviceType}</td>
                        <td className="px-3 py-2">{formatMagRate(rate.amount, currency)}</td>
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
