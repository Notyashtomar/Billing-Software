'use client';

import { useEffect, useState } from 'react';
import { isTestingStationCode, TESTING_STATION_CODE } from '@/lib/login-station';

export function readGatewayStationCode(doc: Record<string, unknown>): string {
  return String(doc.stationCode ?? '').trim().toUpperCase();
}

export function useTestingFrisStation(): boolean {
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const code =
      localStorage.getItem('userStationCode') ||
      localStorage.getItem('fris_selected_station');
    setTesting(isTestingStationCode(code));
  }, []);

  return testing;
}

/** Station chip shown only inside the testing FRIS gateway lists. */
export function GatewayStationMark({ code }: { code?: string }) {
  const testing = useTestingFrisStation();
  if (!testing) return null;
  const label = String(code ?? '').trim().toUpperCase() || '—';
  const own = label === TESTING_STATION_CODE;
  return (
    <span
      className={
        own
          ? 'inline-flex shrink-0 items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900'
          : 'inline-flex shrink-0 items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700'
      }
      title={
        own
          ? 'Created in the testing station'
          : `Gateway record from station ${label}. View only from Testing FRIS.`
      }
    >
      {label}
    </span>
  );
}

export function TestingGatewayBanner() {
  const testing = useTestingFrisStation();
  if (!testing) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
    >
      <p className="font-semibold">Gateway from every station</p>
      <p className="mt-1 text-amber-900/90">
        This testing station is not an airport. Gateway lists show masters from
        all stations. New saves stay on TEST. Edit and delete apply only to
        TEST records.
      </p>
    </div>
  );
}
