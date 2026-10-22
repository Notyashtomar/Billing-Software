'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { fetchLoginStationOptions } from '@/lib/admin-stations-api';
import { switchFrisStation } from '@/lib/fris-session';
import type { StationRecord } from '@/lib/stationAnalyticsMock';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  currentCode: string;
  onClose: () => void;
};

function stationCodeOf(station: StationRecord): string {
  return (station.stationCode || station.code || '').trim().toUpperCase();
}

export function ChangeStationDialog({ open, currentCode, onClose }: Props) {
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setError(null);
    setPendingCode(null);
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchLoginStationOptions()
      .then((rows) => {
        if (!cancelled) setStations(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load stations.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingCode) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, pendingCode]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = [...stations].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    if (!needle) return rows;
    return rows.filter((station) => {
      const code = stationCodeOf(station).toLowerCase();
      return (
        station.name.toLowerCase().includes(needle) ||
        code.includes(needle) ||
        station.city.toLowerCase().includes(needle)
      );
    });
  }, [query, stations]);

  if (!open || typeof document === 'undefined') return null;

  const apply = async (station: StationRecord) => {
    const code = stationCodeOf(station);
    if (!code || code === currentCode || pendingCode) return;
    setPendingCode(code);
    setError(null);
    try {
      await switchFrisStation({
        stationCode: code,
        stationId: station.id,
        stationName: station.name,
        stationCity: station.city,
      });
      window.location.reload();
    } catch (err: unknown) {
      setPendingCode(null);
      setError(err instanceof Error ? err.message : 'Could not change station.');
    }
  };

  return createPortal(
    <div
      className="change-station-overlay fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4 md:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pendingCode) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-station-title"
        className="change-station-dialog flex max-h-[min(88dvh,44rem)] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] text-slate-900 shadow-2xl sm:max-w-3xl sm:rounded-2xl sm:pb-0"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="change-station-title" className="text-base font-semibold text-slate-900">
              Change station
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Stay signed in. FRIS and Billing reload for the station you pick.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(pendingCode)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="relative mx-4 mt-3 flex h-11 shrink-0 items-center sm:mx-5">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, code, or city"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
            aria-label="Search stations"
          />
        </label>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading stations…
            </p>
          ) : loadError ? (
            <p className="py-8 text-center text-sm text-rose-700" role="alert">
              {loadError}
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No stations match that search.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((station) => {
                const code = stationCodeOf(station);
                const current = code === currentCode;
                const busy = pendingCode === code;
                return (
                  <li key={station.id || code}>
                    <button
                      type="button"
                      disabled={current || Boolean(pendingCode)}
                      onClick={() => void apply(station)}
                      className={cn(
                        'group relative flex h-[5.5rem] w-full items-center gap-2.5 overflow-hidden rounded-xl border px-3 text-left transition duration-300 ease-out disabled:cursor-default',
                        current
                          ? 'border-emerald-400 bg-emerald-50 shadow-[0_8px_24px_-16px_rgba(16,185,129,0.9)]'
                          : 'border-slate-200 bg-white hover:-translate-y-1 hover:border-emerald-300 hover:bg-gradient-to-r hover:from-white hover:to-emerald-50 hover:shadow-[0_16px_32px_-18px_rgba(15,23,42,0.45)]',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute inset-y-0 left-0 w-1 transition-all duration-300',
                          current ? 'bg-emerald-500' : 'bg-transparent group-hover:w-1.5 group-hover:bg-emerald-400',
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          'grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] transition duration-300',
                          current
                            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.28)]'
                            : 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white group-hover:scale-105 group-hover:from-emerald-400 group-hover:to-teal-600',
                        )}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <MapPin className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-base font-semibold tracking-wide text-slate-900">{code}</span>
                          {current ? (
                            <span className="rounded-md bg-emerald-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                              Current
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-slate-700">{station.name}</span>
                        <span className="block truncate text-xs text-slate-500">{station.city || 'Station'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error ? (
          <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
