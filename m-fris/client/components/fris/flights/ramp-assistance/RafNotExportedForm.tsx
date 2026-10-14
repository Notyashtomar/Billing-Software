'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CloudOff, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchFhrCollectionFlightLean,
  putFhrCollectionFlightMerge,
} from '@/lib/api';
import {
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
  type FlightData,
  type MainDetailsData,
} from '@/utils/dataProcessor';
import { cn } from '@/lib/utils';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from '@/components/fris/flights/scheduledairlines/flightDetailsFormLayout';

export type RafNotExportedFormProps = {
  flight: FlightData;
  mainDetails?: MainDetailsData | null;
  onStatusChange?: (slNo: string, exportedNAV: string) => void;
};

function normalizeExportLabel(value: unknown): 'Exported' | 'No' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'exported' || raw === 'yes' || raw === 'y' || raw === 'true') {
    return 'Exported';
  }
  return 'No';
}

export default function RafNotExportedForm({
  flight,
  mainDetails,
  onStatusChange,
}: RafNotExportedFormProps) {
  const displayAirline = mainDetails?.airlineName ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType ?? flight.aircraft;
  const serial = nsFormSerialForFlight(flight);

  const [status, setStatus] = useState<'Exported' | 'No'>(() =>
    normalizeExportLabel(flight.exportedNAV),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!serial) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fhr = await fetchFhrCollectionFlightLean(serial);
      const main = fhr?.mainDetails;
      if (main && typeof main === 'object' && !Array.isArray(main)) {
        const m = main as Record<string, unknown>;
        setStatus(
          normalizeExportLabel(m.exportedNAV ?? m.navisionDataExportStatus),
        );
      } else {
        setStatus(normalizeExportLabel(flight.exportedNAV));
      }
    } catch {
      setStatus(normalizeExportLabel(flight.exportedNAV));
    } finally {
      setLoading(false);
    }
  }, [serial, flight.exportedNAV]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyStatus = async (next: 'Exported' | 'No') => {
    if (!serial) {
      toast.error('Missing flight serial.');
      return;
    }
    setSaving(true);
    try {
      const existing = await fetchFhrCollectionFlightLean(serial);
      const mainRaw = existing?.mainDetails;
      const mainObj =
        mainRaw != null && typeof mainRaw === 'object' && !Array.isArray(mainRaw)
          ? (mainRaw as Record<string, unknown>)
          : {};

      const navValue = next === 'Exported' ? 'Y' : 'N';
      await putFhrCollectionFlightMerge(
        serial,
        {
          mainDetails: {
            ...mainObj,
            exportedNAV: next,
            navisionDataExportStatus: navValue,
            airlineName: mainObj.airlineName ?? displayAirline,
            flightCode: mainObj.flightCode ?? displayFlightNo,
            aircraftType: mainObj.aircraftType ?? displayAircraft,
          },
        },
        'raf_not_exported_status',
      );
      setStatus(next);
      onStatusChange?.(String(flight.slNo ?? serial), next);
      toast.success(
        next === 'No'
          ? 'RAF marked as Not Exported (N)'
          : 'RAF marked as Exported (Y)',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update export status');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-8 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
        Loading export status…
      </div>
    );
  }

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <div className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
              <CloudOff className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">Not Exported RAF</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Sl. No. {displayScheduledAirlinesTableSerial(flight)} · {displayAirline} ·{' '}
                {displayFlightNo} · {displayAircraft}
              </p>
            </div>
          </div>

          <p className="mb-4 text-sm text-gray-600">
            Control whether this RAF flight is treated as exported to Navision (ERP). Use{' '}
            <strong>Not Exported</strong> when the record must stay out of the export queue.
          </p>

          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Current status
            </p>
            <p
              className={cn(
                'mt-1 text-lg font-semibold',
                status === 'No' ? 'text-amber-700' : 'text-emerald-700',
              )}
            >
              {status === 'No' ? 'Not Exported (N)' : 'Exported (Y)'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving || status === 'No'}
              onClick={() => void applyStatus('No')}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {saving && status !== 'No' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CloudOff className="h-4 w-4" aria-hidden />
              )}
              Mark as Not Exported (N)
            </button>
            <button
              type="button"
              disabled={saving || status === 'Exported'}
              onClick={() => void applyStatus('Exported')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving && status !== 'Exported' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Mark as Exported (Y)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
