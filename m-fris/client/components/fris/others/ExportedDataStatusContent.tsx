'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CloudUpload, Info, Loader2 } from 'lucide-react';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  fetchFhrCollectionFlightLean,
  putFhrCollectionFlightMerge,
} from '@/lib/api';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  normalizeText,
  required,
  selectRequired,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

const STATUS_FIELD_ORDER = ['flightType', 'exportType', 'serialNo'] as const;
type StatusField = (typeof STATUS_FIELD_ORDER)[number];

const FLIGHT_TYPE_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'scheduled', label: 'Scheduled Airline' },
  { value: 'non-scheduled', label: 'Non Scheduled Airline' },
  { value: 'additional', label: 'Additional Flight' },
  { value: 'raf', label: 'RAF' },
] as const;

const EXPORT_TYPE_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'main-details', label: 'Main Details' },
  { value: 'equipment-manpower', label: 'Equipment Manpower' },
  { value: 'terminal-details', label: 'Terminal Details' },
  { value: 'ramp-details', label: 'Ramp Details' },
  { value: 'load-control', label: 'Load Control' },
] as const;

const dropdownFieldClass =
  'w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200';

const textInputClass =
  'h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

async function applyNavisionExportStatus(
  serialNo: string,
  exportType: string,
  status: 'Y' | 'N',
): Promise<void> {
  const fhr = await fetchFhrCollectionFlightLean(serialNo.trim());
  if (!fhr) {
    throw new Error('No flight record found for this serial number.');
  }

  const navValue = status === 'Y' ? 'Y' : 'N';
  const exportedNavLabel = status === 'Y' ? 'Exported' : 'No';

  if (exportType === 'equipment-manpower') {
    const eq = fhr.equipmentManpower;
    const eqObj =
      eq != null && typeof eq === 'object' && !Array.isArray(eq)
        ? (eq as Record<string, unknown>)
        : {};
    const entries = Array.isArray(eqObj.entries) ? eqObj.entries : [];
    const updatedEntries = entries.map((entry) => {
      if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
        return entry;
      }
      return { ...(entry as Record<string, unknown>), exportedInNav: navValue };
    });

    await putFhrCollectionFlightMerge(
      serialNo.trim(),
      {
        equipmentManpower: {
          ...eqObj,
          entries: updatedEntries.length > 0 ? updatedEntries : [{ exportedInNav: navValue }],
        },
      },
      'navision_export_status',
    );
    return;
  }

  const sectionKey =
    exportType === 'terminal-details'
      ? 'terminalDetails'
      : exportType === 'ramp-details'
        ? 'rampDetails1'
        : exportType === 'load-control'
          ? 'loadControlDetails'
          : 'mainDetails';

  const section = fhr[sectionKey];
  const sectionObj =
    section != null && typeof section === 'object' && !Array.isArray(section)
      ? (section as Record<string, unknown>)
      : {};

  await putFhrCollectionFlightMerge(
    serialNo.trim(),
    {
      [sectionKey]: {
        ...sectionObj,
        exportedNAV: exportedNavLabel,
        navisionDataExportStatus: navValue,
      },
    },
    'navision_export_status',
  );
}

export default function ExportedDataStatusContent() {
  const [flightType, setFlightType] = useState('');
  const [exportType, setExportType] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [pending, setPending] = useState<null | 'Y' | 'N'>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<StatusField>(STATUS_FIELD_ORDER);

  const handleSetStatus = async (status: 'Y' | 'N') => {
    const next: FieldErrors<StatusField> = {};
    const flightTypeErr = selectRequired(flightType, 'flight type');
    if (flightTypeErr) next.flightType = flightTypeErr;
    const exportTypeErr = selectRequired(exportType, 'type');
    if (exportTypeErr) next.exportType = exportTypeErr;
    const serialErr = required(serialNo, 'Serial number');
    if (serialErr) next.serialNo = serialErr;
    if (applyAndFocus(next)) return;

    const serial = normalizeText(serialNo);
    setPending(status);
    try {
      await applyNavisionExportStatus(serial, exportType, status);
      toast.success(
        `Navision Data Export status set to '${status}' for serial ${serial}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not update export status.',
      );
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-emerald-50">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader title="Navision export data" icon={CloudUpload} />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.05 }}
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
        >
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end xl:gap-5">
              <div className="min-w-[160px] flex-1">
                <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-flightType">
                  Select flight type
                </label>
                <AdminRadioDropdown
                  id="field-flightType"
                  value={flightType}
                  onChange={(v) => {
                    setFlightType(v);
                    clearField('flightType');
                  }}
                  options={[...FLIGHT_TYPE_OPTIONS]}
                  className={cn(dropdownFieldClass, errors.flightType && FRIS_INVALID_CONTROL)}
                  aria-invalid={Boolean(errors.flightType)}
                  aria-describedby={errors.flightType ? 'field-flightType-error' : undefined}
                />
                <FormFieldError id="field-flightType-error" message={errors.flightType} />
              </div>

              <div className="min-w-[160px] flex-1">
                <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-exportType">
                  Type
                </label>
                <AdminRadioDropdown
                  id="field-exportType"
                  value={exportType}
                  onChange={(v) => {
                    setExportType(v);
                    clearField('exportType');
                  }}
                  options={[...EXPORT_TYPE_OPTIONS]}
                  className={cn(dropdownFieldClass, errors.exportType && FRIS_INVALID_CONTROL)}
                  aria-invalid={Boolean(errors.exportType)}
                  aria-describedby={errors.exportType ? 'field-exportType-error' : undefined}
                />
                <FormFieldError id="field-exportType-error" message={errors.exportType} />
              </div>

              <div className="min-w-[140px] flex-1">
                <label
                  htmlFor="field-serialNo"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Serial no.
                </label>
                <input
                  id="field-serialNo"
                  type="text"
                  value={serialNo}
                  onChange={(e) => {
                    setSerialNo(e.target.value);
                    clearField('serialNo');
                  }}
                  autoComplete="off"
                  placeholder="e.g. 198120"
                  aria-invalid={Boolean(errors.serialNo)}
                  aria-describedby={errors.serialNo ? 'field-serialNo-error' : undefined}
                  className={cn(textInputClass, errors.serialNo && FRIS_INVALID_CONTROL)}
                />
                <FormFieldError id="field-serialNo-error" message={errors.serialNo} />
              </div>

              <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row xl:w-auto">
                <motion.button
                  type="button"
                  disabled={busy}
                  whileHover={busy ? undefined : { scale: 1.02 }}
                  whileTap={busy ? undefined : { scale: 0.98 }}
                  onClick={() => void handleSetStatus('N')}
                  className={cn(
                    'inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-colors sm:flex-none sm:px-5',
                    busy
                      ? 'cursor-not-allowed opacity-80'
                      : 'bg-red-600 hover:bg-red-700',
                  )}
                >
                  {pending === 'N' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : null}
                  Mark as not exported (N)
                </motion.button>
                <motion.button
                  type="button"
                  disabled={busy}
                  whileHover={busy ? undefined : { scale: 1.02 }}
                  whileTap={busy ? undefined : { scale: 0.98 }}
                  onClick={() => void handleSetStatus('Y')}
                  className={cn(
                    'inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-colors sm:flex-none sm:px-5',
                    busy
                      ? 'cursor-not-allowed opacity-80'
                      : 'bg-emerald-600 hover:bg-emerald-700',
                  )}
                >
                  {pending === 'Y' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : null}
                  Mark as exported (Y)
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.1 }}
          className="mt-6 flex gap-3 rounded-2xl border border-emerald-100/90 bg-emerald-50/40 p-4 sm:p-5"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700">
            <Info className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 space-y-2 text-sm leading-relaxed text-slate-700">
            <p>
              <span className="font-semibold text-emerald-900">Y</span> — Navision data export
              status indicates the record was exported to Navision.
            </p>
            <p>
              <span className="font-semibold text-emerald-900">N</span> — Navision data export
              status indicates the record was not exported to Navision.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
