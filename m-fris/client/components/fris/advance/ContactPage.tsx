'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceList,
  advanceCreate,
  advanceUpdate,
  advanceDelete,
  advanceDocId,
  ADVANCE_PATHS,
  fetchAdvanceContactFhrRepresentatives,
  fetchContactReferenceAirlines,
  type FhrContactRepresentativeUsage,
} from '@/lib/api';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { email, phone, required, runValidators } from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { downloadContactExcelTemplate } from '@/components/fris/advance/importAdvanceContactExcel';
import {
  GATEWAY_DROPDOWN,
  GATEWAY_FILTER_INPUT,
  GATEWAY_PAGE_ROOT,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_TABLE_SECTION,
} from '@/components/fris/advance/gatewayPageLayout';
import NonScheduledContactSection from '@/components/fris/advance/NonScheduledContactSection';
import { ContactFormDrawer } from '@/components/fris/advance/ContactFormDrawer';
import { ContactImportDialog } from '@/components/fris/advance/ContactImportDialog';
import { ContactSignatureCell } from '@/components/fris/advance/ContactSignatureCell';
import {
  CONTACT_DANGER_GHOST_BTN,
  CONTACT_DROPDOWN_OPTIONS,
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
import { cn } from '@/lib/utils';

export type { ContactRow };

const PATH = ADVANCE_PATHS.contact;
const FIELD_ORDER = ['email', 'mobileNo'] as const;
type ContactField = (typeof FIELD_ORDER)[number];

type MainTab = 'scheduled' | 'non-scheduled';
type StatusTab = 'all' | 'fhr-master' | 'unsaved-fhr';

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

export default function ContactPage() {
  const [mainTab, setMainTab] = useState<MainTab>('scheduled');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [form, setForm] = useState<ContactFormValues>(EMPTY_CONTACT_FORM);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fhrRepRows, setFhrRepRows] = useState<ContactRow[]>([]);
  const [fhrUsedOnly, setFhrUsedOnly] = useState<FhrContactRepresentativeUsage[]>([]);
  const [fhrRepsLoading, setFhrRepsLoading] = useState(false);
  const [airlineOptions, setAirlineOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [airlineOptionsLoading, setAirlineOptionsLoading] = useState(false);
  const [nsCount, setNsCount] = useState(0);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<ContactField>(FIELD_ORDER);

  const loadAirlineOptions = useCallback(async () => {
    setAirlineOptionsLoading(true);
    try {
      const [gatewayList, airlineList] = await Promise.all([
        advanceList(ADVANCE_PATHS.gatewayScheduledAirline) as Promise<Record<string, unknown>[]>,
        fetchContactReferenceAirlines() as Promise<Record<string, unknown>[]>,
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

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = (await advanceList(PATH)) as Record<string, unknown>[];
      setRows(list.map(toRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load list');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const fetchFhrRepresentatives = useCallback(async () => {
    setFhrRepsLoading(true);
    try {
      const data = await fetchAdvanceContactFhrRepresentatives();
      setFhrRepRows(
        data.master.map((row) => ({
          id: row.id,
          email: row.email,
          contact: row.contact,
          airline: row.airline,
          airlineRepresentative: row.airlineRepresentative,
          mobileNo: row.mobileNo,
          companyName: row.companyName,
          signatureUrl: row.signatureUrl,
        })),
      );
      setFhrUsedOnly(data.usedInFhrOnly);
    } catch {
      setFhrRepRows([]);
      setFhrUsedOnly([]);
    } finally {
      setFhrRepsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchList(), fetchFhrRepresentatives()]);
  }, [fetchList, fetchFhrRepresentatives]);

  React.useEffect(() => {
    if (mainTab === 'scheduled') void refreshAll();
  }, [mainTab, refreshAll]);

  const resetForm = () => {
    setForm(EMPTY_CONTACT_FORM);
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
      contact: row.contact,
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
        contact: form.contact,
        airline: form.airline.trim(),
        airlineRepresentative: form.airlineRepresentative.trim(),
        mobileNo: form.mobileNo.trim(),
        companyName: form.companyName.trim(),
        signatureUrl: form.signatureUrl,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Contact updated.');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Saved successfully');
      }
      closeDrawer();
      await refreshAll();
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
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleAddFromFhr = (usage: FhrContactRepresentativeUsage) => {
    setForm({
      ...EMPTY_CONTACT_FORM,
      airlineRepresentative: usage.airlineRepresentative,
      airline: usage.airline,
    });
    setEditingId(null);
    clearAll();
    setDrawerOpen(true);
    setStatusTab('all');
    toast.message('Fill remaining details and Save to add this representative to the master list.');
  };

  const filteredAllRows = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesContactFilter(row, debouncedSearch)) return false;
      if (categoryFilter && row.contact !== categoryFilter) return false;
      return true;
    });
  }, [rows, debouncedSearch, categoryFilter]);

  const filteredFhrMaster = useMemo(() => {
    return fhrRepRows.filter((row) => {
      if (!matchesContactFilter(row, debouncedSearch)) return false;
      if (categoryFilter && row.contact !== categoryFilter) return false;
      return true;
    });
  }, [fhrRepRows, debouncedSearch, categoryFilter]);

  const filteredUnsavedFhr = useMemo(() => {
    return fhrUsedOnly.filter((row) =>
      matchesContactFilter(
        {
          email: '',
          contact: '',
          airline: row.airline,
          airlineRepresentative: row.airlineRepresentative,
          mobileNo: '',
          companyName: '',
        },
        debouncedSearch,
      ),
    );
  }, [fhrUsedOnly, debouncedSearch]);

  const tableRows: ContactRow[] =
    statusTab === 'fhr-master'
      ? filteredFhrMaster
      : statusTab === 'all'
        ? filteredAllRows
        : [];

  const busy = listLoading || fhrRepsLoading;
  const scheduledCount = rows.length;

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = (await advanceList(ADVANCE_PATHS.nsContact)) as Record<string, unknown>[];
        if (!cancelled) setNsCount(list.length);
      } catch {
        if (!cancelled) setNsCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainTab]);

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      {/* Main segmented control */}
      <div
        role="tablist"
        aria-label="Airline contact sections"
        className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50/80 p-1"
      >
        {(
          [
            { id: 'scheduled' as const, label: 'Scheduled Airlines', count: scheduledCount },
            {
              id: 'non-scheduled' as const,
              label: 'Non-Scheduled Airlines',
              count: nsCount,
            },
          ] as const
        ).map((tab) => {
          const selected = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMainTab(tab.id)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-[transform,opacity,background-color,color] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] sm:flex-none sm:px-4',
                selected
                  ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-200'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900',
              )}
            >
              {tab.label}
              {typeof tab.count === 'number' ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                    selected ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200/80 text-gray-600',
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {mainTab === 'non-scheduled' ? (
        <NonScheduledContactSection onCountChange={setNsCount} />
      ) : (
        <>
          {/* Sticky toolbar */}
          <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 rounded-xl border border-emerald-200/80 bg-white/95 p-3 shadow-sm backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
              <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search contacts…"
                className={`${GATEWAY_FILTER_INPUT} border-0 bg-transparent px-0 shadow-none focus:ring-0`}
                aria-label="Search contacts"
              />
            </div>
            <div className="w-full min-w-[10rem] sm:w-48">
              <AdminRadioDropdown
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: '', label: 'All categories' },
                  ...CONTACT_DROPDOWN_OPTIONS,
                ]}
                placeholder="Filter by category"
                className={GATEWAY_DROPDOWN}
                clearable
                clearLabel="Clear category"
                searchPlaceholder="Search category…"
                aria-label="Filter by category"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <button
                type="button"
                onClick={() => void downloadContactExcelTemplate()}
                className={CONTACT_SECONDARY_BTN}
              >
                <Download className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Download Template</span>
                <span className="sm:hidden">Template</span>
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className={CONTACT_SECONDARY_BTN}
              >
                <Upload className="h-4 w-4" aria-hidden />
                <span>Import Excel</span>
              </button>
              <AdvanceGatewayExportButton
                disabled={busy}
                emptyMessage="No contacts to export."
                exportParams={{
                  sheetName: 'Airline Contact',
                  fileName: 'advance-airline-contact.xlsx',
                  headers: [
                    'Email',
                    'Contact',
                    'Airline',
                    'Airline Representative',
                    'Mobile No.',
                    'Company Name',
                  ],
                  rows: filteredAllRows.map((row) => [
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

          {/* Status tabs + unified table */}
          <section className={GATEWAY_TABLE_SECTION}>
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-gray-100 bg-gray-50/80 px-3 py-2">
              {(
                [
                  { id: 'all' as const, label: 'All Contacts', count: filteredAllRows.length },
                  {
                    id: 'fhr-master' as const,
                    label: 'FHR Master Only',
                    count: filteredFhrMaster.length,
                  },
                  {
                    id: 'unsaved-fhr' as const,
                    label: 'Unsaved FHR Reps',
                    count: filteredUnsavedFhr.length,
                  },
                ] as const
              ).map((tab) => {
                const selected = statusTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusTab(tab.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-[transform,opacity,background-color] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] sm:text-sm',
                      selected
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900',
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        'tabular-nums',
                        selected ? 'text-emerald-50' : 'text-gray-400',
                      )}
                    >
                      ({tab.count})
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={busy}
                className={`${CONTACT_SECONDARY_BTN} ml-auto h-8 px-3 text-xs`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Refresh
              </button>
            </div>

            <div className={GATEWAY_TABLE_SCROLL}>
              {statusTab === 'unsaved-fhr' ? (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-amber-100 bg-amber-50/90 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Airline Representative
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Airline</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">FHR usage</th>
                      <th className="w-36 px-4 py-3 text-right font-semibold text-gray-700">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fhrRepsLoading ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                          Loading unsaved FHR representatives…
                        </td>
                      </tr>
                    ) : filteredUnsavedFhr.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                          No unsaved FHR representatives. All used names are on the master list.
                        </td>
                      </tr>
                    ) : (
                      filteredUnsavedFhr.map((row) => (
                        <tr
                          key={`${row.airlineRepresentative}-${row.airline}`}
                          className="border-b border-amber-100/80 hover:bg-amber-50/40"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {row.airlineRepresentative}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.airline || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {row.usageCount} flight{row.usageCount === 1 ? '' : 's'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleAddFromFhr(row)}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-[transform,opacity] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-emerald-50 active:scale-[0.97]"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add to master
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">Email</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Contact</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Airline</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Rep Name</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Mobile</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Company</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Signature</th>
                      <th className="w-24 px-4 py-3 text-right font-semibold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {busy ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                          Loading contacts…
                        </td>
                      </tr>
                    ) : tableRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                          {statusTab === 'fhr-master'
                            ? 'No FHR master representatives match your filters.'
                            : 'No contacts yet. Use + Add Contact or Import Excel.'}
                        </td>
                      </tr>
                    ) : (
                      tableRows.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => handleEdit(row)}
                          className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-emerald-50/40"
                          title="Click to edit"
                        >
                          <td className="px-4 py-3 text-gray-900">{row.email || '—'}</td>
                          <td className="px-4 py-3 text-gray-700">{row.contact || '—'}</td>
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
              )}
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
            errors={errors}
            clearField={clearField}
            setFieldError={setFieldError}
            fieldIdPrefix="skd-contact"
          />

          <ContactImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            path={PATH}
            onImported={refreshAll}
          />
        </>
      )}
    </div>
  );
}
