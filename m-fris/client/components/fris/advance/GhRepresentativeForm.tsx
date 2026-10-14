'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Loader2, Pencil, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADVANCE_PATHS,
  advanceBulkCreate,
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
} from '@/lib/api';
import SignaturePad from '@/components/fris/flights/scheduledairlines/signatures/SignaturePad';
import {
  downloadGhRepExcelTemplate,
  parseAdvanceGhrepExcel,
} from '@/components/fris/advance/importAdvanceGhrepExcel';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  GATEWAY_CHECKBOX_CONTROL,
  GATEWAY_CHECKBOX_INPUT,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL_SPACER,
} from '@/components/fris/advance/gatewayPageLayout';
import {
  email,
  employeeId,
  fileMaxSize,
  fileType,
  maxLength,
  minLength,
  normalizeText,
  required,
  runValidators,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';

type GhRepresentativeRow = {
  id: string;
  employeeName: string;
  employeeCode: string;
  emailId: string;
  active: boolean;
  signatureUrl: string;
};

const PATH = ADVANCE_PATHS.ghrep;

function employeeNameNoSpecialCharacters(value: string): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(v)) {
    return 'Employee name may only contain letters.';
  }
  return null;
}
const FIELD_ORDER = ['employeeName', 'employeeCode', 'emailId'] as const;
type GhRepField = (typeof FIELD_ORDER)[number];
const EXCEL_MAX_BYTES = 5 * 1024 * 1024;

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
const INPUT_INVALID =
  'w-full px-3 py-2 rounded-lg border border-red-500 bg-white text-gray-900 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

function inputClass(invalid?: boolean): string {
  return invalid ? INPUT_INVALID : INPUT_CLASS;
}

const EMPTY_FORM = {
  employeeName: '',
  employeeCode: '',
  emailId: '',
  active: true,
  signatureUrl: '',
};

function validateGhRepForm(values: {
  employeeName: string;
  employeeCode: string;
  emailId: string;
}): FieldErrors<GhRepField> {
  const employeeName = normalizeText(values.employeeName);
  const employeeCode = values.employeeCode.trim().toUpperCase();
  const emailId = values.emailId.trim().toLowerCase();
  const next: FieldErrors<GhRepField> = {};

  const nameErr = runValidators(
    required(employeeName, 'Employee name'),
    minLength(employeeName, 2, 'Employee name'),
    maxLength(employeeName, 100, 'Employee name'),
    employeeNameNoSpecialCharacters(employeeName),
  );
  if (nameErr) next.employeeName = nameErr;

  const codeErr = runValidators(
    required(employeeCode, 'Employee code'),
    employeeId(employeeCode, 'Employee code'),
  );
  if (codeErr) next.employeeCode = codeErr;

  const emailErr = runValidators(required(emailId, 'Email ID'), email(emailId, 'Email ID'));
  if (emailErr) next.emailId = emailErr;

  return next;
}

function toRow(doc: Record<string, unknown>): GhRepresentativeRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    employeeName: String(d.employeeName ?? '').trim(),
    employeeCode: String(d.employeeCode ?? '').trim(),
    emailId: String(d.emailId ?? '').trim(),
    active: d.active !== false,
    signatureUrl: String(d.signatureUrl ?? '').trim(),
  };
}

export default function GhRepresentativeForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [rows, setRows] = useState<GhRepresentativeRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<GhRepField>(FIELD_ORDER);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = (await advanceList(PATH)) as Record<string, unknown>[];
      setRows(list.map(toRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load GH representatives');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    clearAll();
  };

  const handleEdit = (row: GhRepresentativeRow) => {
    clearAll();
    setForm({
      employeeName: row.employeeName,
      employeeCode: row.employeeCode.toUpperCase(),
      emailId: row.emailId,
      active: row.active,
      signatureUrl: row.signatureUrl,
    });
    setEditingId(row.id);
  };

  const handleSave = async () => {
    const next = validateGhRepForm(form);
    if (applyAndFocus(next)) {
      if (next.employeeName) toast.error(next.employeeName);
      return;
    }

    const employeeName = normalizeText(form.employeeName);
    const employeeCode = form.employeeCode.trim().toUpperCase();
    const emailId = form.emailId.trim().toLowerCase();
    setForm((prev) => ({ ...prev, employeeName, employeeCode, emailId }));

    setSaving(true);
    try {
      const body = {
        employeeName,
        employeeCode,
        emailId,
        active: form.active,
        signatureUrl: form.signatureUrl,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('GH representative updated.');
      } else {
        await advanceCreate(PATH, body);
        toast.success('GH representative saved.');
      }
      resetForm();
      await fetchList();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('employeeName', msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await advanceDelete(PATH, id);
      toast.success('GH representative deleted.');
      if (editingId === id) resetForm();
      await fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setExcelFile(file);
  };

  const handleExcelImport = async () => {
    if (!excelFile) return;

    const typeErr = fileType(excelFile, ['.xlsx', '.xls'], 'Excel file');
    const sizeErr = fileMaxSize(excelFile, EXCEL_MAX_BYTES, 'Excel file');
    if (typeErr || sizeErr) {
      toast.error(typeErr ?? sizeErr);
      setExcelFile(null);
      if (excelInputRef.current) excelInputRef.current.value = '';
      return;
    }

    setExcelImporting(true);
    try {
      const { rows: parsedRows, skipped } = await parseAdvanceGhrepExcel(excelFile);
      if (parsedRows.length === 0) {
        const reason = skipped[0]?.reason ?? 'No valid rows found in the Excel file.';
        toast.error(reason);
        return;
      }

      const existingCodes = new Set(rows.map((r) => r.employeeCode.trim().toUpperCase()));
      const toCreate = parsedRows
        .map(({ payload }) => payload)
        .filter((payload) => {
          const code = String(payload.employeeCode ?? '').trim().toUpperCase();
          return code && !existingCodes.has(code);
        });

      if (toCreate.length === 0) {
        toast.info('No new representatives to import (empty rows or duplicate employee codes).');
        return;
      }

      const result = (await advanceBulkCreate(PATH, { rows: toCreate })) as {
        inserted?: number;
        skipped?: number;
      };
      const inserted = result.inserted ?? toCreate.length;
      const serverSkipped = result.skipped ?? 0;

      await fetchList();

      if (inserted > 0) {
        toast.success(
          `Imported ${inserted} GH representative${inserted === 1 ? '' : 's'} from Excel.`,
        );
      }
      const totalSkipped = skipped.length + serverSkipped + (parsedRows.length - toCreate.length);
      if (totalSkipped > 0) {
        toast.message(
          `Skipped ${totalSkipped} row${totalSkipped === 1 ? '' : 's'} (missing code, duplicate, or unrecognized).`,
        );
      }
      if (inserted === 0) {
        toast.error('Excel import did not add any new representatives.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel import failed');
    } finally {
      setExcelImporting(false);
      setExcelFile(null);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-gray-50/50 overflow-visible">
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                htmlFor="field-employeeName"
              >
                Employee Name
              </label>
              <input
                id="field-employeeName"
                name="employeeName"
                type="text"
                value={form.employeeName}
                aria-invalid={!!errors.employeeName}
                aria-describedby={errors.employeeName ? 'field-employeeName-error' : undefined}
                onChange={(e) => {
                  const raw = e.target.value;
                  const value = raw.replace(/[^A-Za-z ]/g, '');
                  setForm((prev) => ({ ...prev, employeeName: value }));
                  setFieldError(
                    'employeeName',
                    value !== raw ? 'Employee name may only contain letters.' : null,
                  );
                }}
                onBlur={(e) => {
                  const employeeName = normalizeText(e.target.value);
                  setForm((prev) => ({ ...prev, employeeName }));
                  setFieldError(
                    'employeeName',
                    runValidators(
                      required(employeeName, 'Employee name'),
                      minLength(employeeName, 2, 'Employee name'),
                      maxLength(employeeName, 100, 'Employee name'),
                      employeeNameNoSpecialCharacters(employeeName),
                    ),
                  );
                }}
                className={inputClass(!!errors.employeeName)}
                placeholder="Enter employee name"
                maxLength={100}
                disabled={saving}
              />
              <FormFieldError id="field-employeeName-error" message={errors.employeeName} />
            </div>
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                htmlFor="field-employeeCode"
              >
                Employee Code
              </label>
              <input
                id="field-employeeCode"
                name="employeeCode"
                type="text"
                value={form.employeeCode}
                aria-invalid={!!errors.employeeCode}
                aria-describedby={errors.employeeCode ? 'field-employeeCode-error' : undefined}
                onChange={(e) => {
                  const employeeCode = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9_-]/g, '')
                    .slice(0, 20);
                  setForm((prev) => ({ ...prev, employeeCode }));
                  clearField('employeeCode');
                }}
                onBlur={(e) => {
                  const employeeCode = e.target.value.trim().toUpperCase();
                  setForm((prev) => ({ ...prev, employeeCode }));
                  setFieldError(
                    'employeeCode',
                    runValidators(
                      required(employeeCode, 'Employee code'),
                      employeeId(employeeCode, 'Employee code'),
                    ),
                  );
                }}
                className={cn(inputClass(!!errors.employeeCode), 'uppercase')}
                placeholder="Enter employee code"
                maxLength={20}
                disabled={saving}
              />
              <FormFieldError id="field-employeeCode-error" message={errors.employeeCode} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-emailId">
                Email ID
              </label>
              <input
                id="field-emailId"
                name="emailId"
                type="email"
                value={form.emailId}
                aria-invalid={!!errors.emailId}
                aria-describedby={errors.emailId ? 'field-emailId-error' : undefined}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, emailId: e.target.value }));
                  clearField('emailId');
                }}
                onBlur={(e) => {
                  const emailId = e.target.value.trim().toLowerCase();
                  setForm((prev) => ({ ...prev, emailId }));
                  setFieldError(
                    'emailId',
                    runValidators(required(emailId, 'Email ID'), email(emailId, 'Email ID')),
                  );
                }}
                className={inputClass(!!errors.emailId)}
                placeholder="Enter email ID"
                autoComplete="email"
                disabled={saving}
              />
              <FormFieldError id="field-emailId-error" message={errors.emailId} />
            </div>
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="min-w-0">
                <span className={GATEWAY_LABEL_SPACER} aria-hidden="true">
                  &nbsp;
                </span>
                <label className={GATEWAY_CHECKBOX_CONTROL}>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                    className={GATEWAY_CHECKBOX_INPUT}
                    disabled={saving}
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
                <FormFieldError />
              </div>
              <div className={GATEWAY_FORM_ACTIONS}>
                <motion.button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  aria-busy={saving}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex h-10 items-center gap-2 px-5 rounded-xl font-medium text-sm text-white bg-amber-500 hover:bg-amber-600 shadow-md shadow-amber-500/25 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
                </motion.button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-medium text-gray-700">
                GH Representative Signature
              </label>
              {editingId ? (
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Editing — draw or update signature below
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  Optional — reused on FHR reports for this representative
                </span>
              )}
            </div>
            <SignaturePad
              value={form.signatureUrl}
              onChange={(dataUrl) => setForm((prev) => ({ ...prev, signatureUrl: dataUrl }))}
              disabled={saving}
              height={160}
              placeholder="Draw GH representative signature"
              onPreview={(dataUrl) => setSignaturePreview(dataUrl || form.signatureUrl)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-visible">
        <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">Import from Excel</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Upload a spreadsheet with any of: Employee Name, Employee Code, Email ID, Active.
            Columns not present in the file are left blank in the app.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleExcelFileChange}
            className="hidden"
            id="gh-rep-excel-import"
          />
          <label
            htmlFor="gh-rep-excel-import"
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 text-sm text-gray-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50"
          >
            <Upload className="h-4 w-4" />
            Choose Excel file
          </label>
          <span className="text-sm text-gray-500">
            {excelFile ? excelFile.name : 'No file chosen'}
          </span>
          <motion.button
            type="button"
            onClick={() => void handleExcelImport()}
            disabled={!excelFile || excelImporting}
            aria-busy={excelImporting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {excelImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {excelImporting ? 'Importing…' : 'Import from Excel'}
          </motion.button>
          <button
            type="button"
            onClick={() => void downloadGhRepExcelTemplate()}
            className="text-sm font-medium text-emerald-600 underline hover:text-emerald-700"
          >
            Download template
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="px-4 py-3 font-semibold text-gray-700">Employee Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Employee Code</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Email ID</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Signature</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Active</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right">Edit</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right">Delete</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Loading GH representatives…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No GH representative records found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => handleEdit(row)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      editingId === row.id
                        ? 'bg-emerald-50/80 hover:bg-emerald-50'
                        : 'hover:bg-gray-50/80'
                    }`}
                    title="Click row to edit representative and signature"
                  >
                    <td className="px-4 py-3 text-gray-900">{row.employeeName}</td>
                    <td className="px-4 py-3 text-gray-900">{row.employeeCode}</td>
                    <td className="px-4 py-3 text-gray-900">{row.emailId || '—'}</td>
                    <td className="px-4 py-3">
                      {row.signatureUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSignaturePreview(row.signatureUrl);
                          }}
                          className="inline-flex items-center rounded-md border border-gray-200 bg-white p-1 hover:border-emerald-300"
                          title="Preview signature"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={row.signatureUrl}
                            alt={`${row.employeeName} signature`}
                            className="h-8 max-w-[7rem] object-contain"
                          />
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {row.active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(row);
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </motion.button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(row.id);
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {signaturePreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Signature preview"
          onClick={() => setSignaturePreview(null)}
        >
          <div
            className="max-w-lg w-full rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-medium text-gray-700">Signature preview</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signaturePreview}
              alt="Signature preview"
              className="mx-auto max-h-48 w-full object-contain rounded-lg border border-gray-200 bg-gray-50"
            />
            <button
              type="button"
              onClick={() => setSignaturePreview(null)}
              className="mt-4 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
