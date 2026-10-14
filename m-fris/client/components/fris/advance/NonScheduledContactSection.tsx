'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADVANCE_PATHS,
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
} from '@/lib/api';
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { email, phone, required, runValidators } from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_TABLE_SECTION,
} from '@/components/fris/advance/gatewayPageLayout';
import { ContactFormDrawer } from '@/components/fris/advance/ContactFormDrawer';
import { ContactImportDialog } from '@/components/fris/advance/ContactImportDialog';
import { ContactSignatureCell } from '@/components/fris/advance/ContactSignatureCell';
import {
  CONTACT_DANGER_GHOST_BTN,
  CONTACT_GHOST_BTN,
  CONTACT_PRIMARY_BTN,
  CONTACT_SECONDARY_BTN,
  EMPTY_CONTACT_FORM,
  matchesContactFilter,
  normalizeContactEmail,
  useDebouncedValue,
  type ContactFormValues,
  type ContactRow,
} from '@/components/fris/advance/contactShared';

const PATH = ADVANCE_PATHS.nsContact;
const EMPTY_NS_FORM: ContactFormValues = {
  ...EMPTY_CONTACT_FORM,
  contact: 'Non-SKD',
};
const FIELD_ORDER = ['email', 'mobileNo'] as const;
type ContactField = (typeof FIELD_ORDER)[number];

function toRow(doc: Record<string, unknown>): ContactRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    email: String(d.email ?? '').trim(),
    contact: String(d.contact ?? '').trim(),
    airline: String(d.airline ?? '').trim(),
    airlineRepresentative: String(d.airlineRepresentative ?? '').trim(),
    mobileNo: String(d.mobileNo ?? '').trim(),
    companyName: String(d.companyName ?? '').trim(),
    signatureUrl: String(d.signatureUrl ?? '').trim(),
  };
}

/**
 * Advance → Airline Contact — Non-scheduled section.
 * Saves to `advance-ns-contact` and feeds Non-Scheduled Main Details Airline Rep.
 */
export default function NonScheduledContactSection({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
} = {}) {
  const [form, setForm] = useState<ContactFormValues>(EMPTY_NS_FORM);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [airlineOptions, setAirlineOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [airlineOptionsLoading, setAirlineOptionsLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<ContactField>(FIELD_ORDER);

  const loadAirlineOptions = useCallback(async () => {
    setAirlineOptionsLoading(true);
    try {
      const list = (await advanceList(ADVANCE_PATHS.nonScheduledAirline)) as Record<
        string,
        unknown
      >[];
      const seen = new Set<string>();
      const options: Array<{ value: string; label: string }> = [];
      for (const doc of list) {
        const d = advanceDocId(doc);
        const name = String(d.airline ?? '').trim();
        const code = String(d.airlineCode ?? '').trim();
        const label = name || code;
        if (!label) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({
          value: name || code,
          label: code && name && code !== name ? `${name} (${code})` : label,
        });
      }
      options.sort((a, b) => a.label.localeCompare(b.label));
      setAirlineOptions(options);
    } catch {
      setAirlineOptions([]);
    } finally {
      setAirlineOptionsLoading(false);
    }
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = (await advanceList(PATH)) as Record<string, unknown>[];
      const mapped = list.map(toRow);
      setRows(mapped);
      onCountChange?.(mapped.length);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to load non-scheduled contacts',
      );
      setRows([]);
      onCountChange?.(0);
    } finally {
      setListLoading(false);
    }
  }, [onCountChange]);

  React.useEffect(() => {
    void loadAirlineOptions();
    void fetchList();
  }, [loadAirlineOptions, fetchList]);

  const resetForm = () => {
    setForm(EMPTY_NS_FORM);
    setEditingId(null);
    clearAll();
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const handleEdit = (row: ContactRow) => {
    setForm({
      email: row.email,
      contact: row.contact || 'Non-SKD',
      airline: row.airline,
      airlineRepresentative: row.airlineRepresentative,
      mobileNo: row.mobileNo,
      companyName: row.companyName,
      signatureUrl: row.signatureUrl,
    });
    setEditingId(row.id);
    clearAll();
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    const emailValue = normalizeContactEmail(form.email);
    setForm((f) => ({ ...f, email: emailValue }));
    const next: Partial<Record<ContactField, string>> = {};
    const emailError = runValidators(
      editingId ? null : required(emailValue, 'Email'),
      email(emailValue),
    );
    const mobileError = phone(form.mobileNo, 'Mobile number');
    if (emailError) next.email = emailError;
    if (mobileError) next.mobileNo = mobileError;
    if (applyAndFocus(next)) return;
    setLoading(true);
    try {
      const body = {
        email: emailValue,
        contact: form.contact || 'Non-SKD',
        airline: form.airline.trim(),
        airlineRepresentative: form.airlineRepresentative.trim(),
        mobileNo: form.mobileNo.trim(),
        companyName: form.companyName.trim(),
        signatureUrl: form.signatureUrl,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Non-scheduled contact updated.');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Non-scheduled contact saved.');
      }
      closeDrawer();
      await fetchList();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      setFieldError('email', message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await advanceDelete(PATH, id);
      toast.success('Deleted');
      if (editingId === id) closeDrawer();
      await fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesContactFilter(row, debouncedSearch)),
    [rows, debouncedSearch],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="px-0.5">
        <p className="text-xs text-gray-600 sm:text-sm">
          Representatives saved here appear in Flights → Non-Scheduled Airlines → Main Details →
          Airline Rep (filtered by flight airline).
        </p>
      </div>

      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 rounded-xl border border-amber-200/80 bg-white/95 p-3 shadow-sm backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search non-scheduled contacts…"
            className={`${GATEWAY_FILTER_INPUT} border-0 bg-transparent px-0 shadow-none focus:ring-0`}
            aria-label="Search non-scheduled contacts"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className={CONTACT_SECONDARY_BTN}
          >
            <Upload className="h-4 w-4" aria-hidden />
            Import Excel
          </button>
          <AdvanceGatewayExportButton
            disabled={listLoading}
            emptyMessage="No non-scheduled contacts to export."
            exportParams={{
              sheetName: 'NS Airline Contact',
              fileName: 'advance-ns-airline-contact.xlsx',
              headers: [
                'Email',
                'Contact',
                'Airline',
                'Airline Representative',
                'Mobile No.',
                'Company Name',
              ],
              rows: filteredRows.map((row) => [
                row.email,
                row.contact,
                row.airline,
                row.airlineRepresentative,
                row.mobileNo,
                row.companyName,
              ]),
            }}
          />
          <button type="button" onClick={openCreate} className={CONTACT_PRIMARY_BTN}>
            <Plus className="h-4 w-4" aria-hidden />
            Add Contact
          </button>
        </div>
      </div>

      <section className={GATEWAY_TABLE_SECTION}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-100 bg-amber-50/50 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Non-Scheduled Airline Contacts
            </h3>
            <p className="mt-0.5 text-xs text-gray-600">
              {filteredRows.length} record{filteredRows.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchList()}
            disabled={listLoading}
            className={`${CONTACT_SECONDARY_BTN} h-8 px-3 text-xs`}
          >
            {listLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Refresh
          </button>
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Email</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Airline</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Rep Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Mobile</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Company</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Signature</th>
                <th className="w-24 px-4 py-3 text-right font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    No non-scheduled contacts yet. Use + Add Contact.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => handleEdit(row)}
                    className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-amber-50/50"
                    title="Click to edit"
                  >
                    <td className="px-4 py-3 text-gray-900">{row.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.airline || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.airlineRepresentative || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.mobileNo || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.companyName || '—'}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <ContactSignatureCell
                        signatureUrl={row.signatureUrl}
                        label={row.airlineRepresentative || row.email || 'Contact'}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(row);
                          }}
                          className={CONTACT_GHOST_BTN}
                          title="Edit"
                          aria-label="Edit contact"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(row.id);
                          }}
                          className={CONTACT_DANGER_GHOST_BTN}
                          title="Delete"
                          aria-label="Delete contact"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ContactFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        form={form}
        setForm={setForm}
        editingId={editingId}
        loading={loading}
        onSave={handleSave}
        onCancel={closeDrawer}
        airlineOptions={airlineOptions}
        airlineOptionsLoading={airlineOptionsLoading}
        lockedContactType="Non-SKD"
        errors={errors}
        clearField={clearField}
        setFieldError={setFieldError}
        fieldIdPrefix="ns-contact"
        signatureHint="Optional — reused on non-scheduled FHR reports"
      />

      <ContactImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        path={PATH}
        onImported={fetchList}
      />
    </div>
  );
}
