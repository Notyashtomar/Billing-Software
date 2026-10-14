'use client';

import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, Search, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceList,
  advanceCreate,
  advanceDelete,
  advanceDocId,
  ADVANCE_PATHS,
  fetchAirlineLogoReferenceAirlines,
} from '@/lib/api';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { advanceBoolLabel } from '@/components/fris/advance/exportAdvanceGatewayExcel';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { normalizeText, validateFormValues } from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  GATEWAY_PAGE_ROOT,
  GATEWAY_FORM_SECTION,
  GATEWAY_FORM_INNER,
  GATEWAY_FORM_GRID,
  GATEWAY_FORM_FIELD,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

export type AirlineLogoItem = {
  id: string;
  airlineName: string;
  logoDataUrl: string;
};

const PATH = ADVANCE_PATHS.airlineLogo;
const FIELD_ORDER = ['airlineName', 'logo'] as const;
type AirlineLogoField = (typeof FIELD_ORDER)[number];

function toItem(doc: Record<string, unknown>): AirlineLogoItem {
  const d = advanceDocId(doc);
  const airlineName = d.airlineName ?? d.airline ?? '';
  const logoDataUrl = d.logoDataUrl ?? d.logo ?? '';
  return {
    id: d.id,
    airlineName: typeof airlineName === 'string' ? airlineName : String(airlineName),
    logoDataUrl: typeof logoDataUrl === 'string' ? logoDataUrl : String(logoDataUrl),
  };
}

export default function AirlineLogoPage() {
  const [airlineName, setAirlineName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState<AirlineLogoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [airlineOptions, setAirlineOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [airlineOptionsLoading, setAirlineOptionsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AirlineLogoField>(FIELD_ORDER);

  const loadAirlineOptions = useCallback(async () => {
    setAirlineOptionsLoading(true);
    try {
      const [gatewayList, airlineList] = await Promise.all([
        advanceList(ADVANCE_PATHS.gatewayScheduledAirline) as Promise<
          Record<string, unknown>[]
        >,
        fetchAirlineLogoReferenceAirlines() as Promise<Record<string, unknown>[]>,
      ]);
      const seen = new Set<string>();
      const options: Array<{ value: string; label: string }> = [];
      const addName = (raw: unknown) => {
        const name = String(raw ?? '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        options.push({ value: name, label: name });
      };
      for (const doc of gatewayList) {
        const d = advanceDocId(doc);
        addName(d.airlines ?? d.airline);
      }
      for (const doc of airlineList) {
        const d = advanceDocId(doc);
        addName(d.airlineName ?? d.airline ?? d.name);
      }
      options.sort((a, b) => a.label.localeCompare(b.label));
      setAirlineOptions(options);
    } catch {
      setAirlineOptions([]);
    } finally {
      setAirlineOptionsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAirlineOptions();
  }, [loadAirlineOptions]);

  const fetchList = useCallback(async (filterTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(
        PATH,
        filterTerm?.trim() ? { filter: filterTerm } : undefined
      )) as Record<string, unknown>[];
      setItems(list.map(toItem));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load logos');
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setFieldError('logo', 'Upload an image file.');
      return;
    }
    setLogoFile(file);
    clearField('logo');
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const normalizedAirlineName = normalizeText(airlineName);
    const next = validateFormValues(
      { airlineName: normalizedAirlineName, logo: logoPreview ? 'selected' : '' },
      {
        airlineName: { label: 'Airline name', required: true, select: true },
        logo: { label: 'Logo', required: true },
      },
    );
    if (applyAndFocus(next)) return;

    setLoading(true);
    try {
      await advanceCreate(PATH, {
        airlineName: normalizedAirlineName,
        logoDataUrl: logoPreview,
      });
      toast.success('Logo saved successfully');
      setAirlineName('');
      setLogoFile(null);
      setLogoPreview(null);
      fileInputRef.current?.value && (fileInputRef.current.value = '');
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('airlineName', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await advanceDelete(PATH, id);
      toast.success('Logo removed');
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  const handleGet = () => fetchList(filter);

  const q = filter.trim().toLowerCase();
  const filteredItems = q
    ? items.filter((item) => item.airlineName.toLowerCase().includes(q))
    : items;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-airlineName">Name of Airline</label>
              <AdminRadioDropdown
                id="field-airlineName"
                value={airlineName}
                onChange={(v) => {
                  setAirlineName(v);
                  clearField('airlineName');
                }}
                onBlur={() =>
                  setFieldError(
                    'airlineName',
                    validateFormValues(
                      { airlineName: normalizeText(airlineName) },
                      { airlineName: { label: 'Airline name', required: true, select: true } },
                    ).airlineName ?? null,
                  )
                }
                options={[
                  { value: '', label: airlineOptionsLoading ? 'Loading airlines...' : 'Select airline' },
                  ...airlineOptions,
                ]}
                disabled={airlineOptionsLoading || loading}
                aria-invalid={!!errors.airlineName}
                aria-describedby={errors.airlineName ? 'field-airlineName-error' : undefined}
                className={`${gatewayControlClass(!!errors.airlineName)} disabled:bg-gray-50 disabled:cursor-not-allowed`}
              />
              <FormFieldError id="field-airlineName-error" message={errors.airlineName} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-logo">Upload Logo</label>
              <div className="flex h-10 items-center gap-3">
                <input
                  ref={fileInputRef}
                  id="field-logo"
                  name="logo"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  onBlur={() =>
                    setFieldError('logo', logoPreview ? null : 'Logo is required.')
                  }
                  aria-invalid={!!errors.logo}
                  aria-describedby={errors.logo ? 'field-logo-error' : undefined}
                  className="sr-only"
                  disabled={loading}
                />
                <label
                  htmlFor="field-logo"
                  className={`flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-3 text-sm text-gray-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 ${
                    errors.logo ? 'border-red-500' : 'border-gray-200'
                  }`}
                >
                  <Upload className="h-4 w-4 shrink-0" />
                  <span className="truncate">{logoFile ? logoFile.name : 'Choose file'}</span>
                </label>
                {logoPreview && (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    <img src={logoPreview} alt="Preview" className="h-full w-full object-contain" />
                  </div>
                )}
              </div>
              <FormFieldError id="field-logo-error" message={errors.logo} />
            </div>
            <div className={GATEWAY_FORM_ACTIONS}>
              <motion.button
                type="button"
                onClick={handleSave}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`${GATEWAY_SAVE_BTN} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-500`}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" />}
                {loading ? 'Saving...' : 'Save'}
              </motion.button>
            </div>
          </div>
        </div>
      </section>

      <section className={GATEWAY_TABLE_SECTION}>
        <div className={GATEWAY_FILTER_BAR}>
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by airline name..."
              className={GATEWAY_FILTER_INPUT}
            />
          </div>
          <motion.button
            type="button"
            onClick={handleGet}
            disabled={listLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={GATEWAY_GET_BTN}
          >
            {listLoading ? 'Loading...' : 'Get'}
          </motion.button>
          <AdvanceGatewayExportButton
            disabled={listLoading}
            emptyMessage="No airline logos to export."
            exportParams={{
              sheetName: 'Airline Logo',
              fileName: 'advance-airline-logo.xlsx',
              headers: ['Airline Name', 'Has Logo'],
              rows: filteredItems.map((item) => [
                item.airlineName,
                advanceBoolLabel(Boolean(item.logoDataUrl)),
              ]),
            }}
          />
        </div>
        <div className={`${GATEWAY_TABLE_SCROLL} p-4`}>
          {filteredItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No airline logos match your filter. Add one above or use Get to refresh.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredItems.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative group rounded-xl border border-gray-100 bg-gray-50/50 p-4 flex flex-col items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="w-full aspect-square max-w-[120px] rounded-lg bg-white border border-gray-100 overflow-hidden flex items-center justify-center p-2">
                    <img
                      src={item.logoDataUrl}
                      alt={item.airlineName}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 text-center line-clamp-2">{item.airlineName}</span>
                  <motion.button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
