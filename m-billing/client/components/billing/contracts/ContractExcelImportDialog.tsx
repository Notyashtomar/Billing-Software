'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BillingApi } from '@/lib/billing-api';
import {
  downloadContractExcelTemplate,
  parseContractExcel,
  type ContractExcelParseResult,
  type ParsedContractExcelRow,
} from './importContractExcel';
import { billingStationCodeFromSession } from '../billingFiscalYear';
import { contractImportStationMismatch } from './inferContractImportStation';

type Props = {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void | Promise<void>;
};

type ImportSummary = {
  created: number;
  updated: number;
  activated: number;
  failed: Array<{ rowNumber: number; contractNumber: string; reason: string }>;
  clientErrors: Array<{ rowNumber: number; reason: string }>;
};

export function ContractExcelImportDialog({
  api,
  open,
  onOpenChange,
  onImported,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ContractExcelParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setParsed(null);
    setSummary(null);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = '';
  }, [open]);

  const selectFile = async (nextFile: File | null) => {
    if (!nextFile) return;
    setFile(nextFile);
    setParsed(null);
    setSummary(null);
    setParsing(true);
    try {
      setParsed(await parseContractExcel(nextFile));
    } catch (error) {
      setParsed({
        rows: [],
        errors: [
          {
            rowNumber: 1,
            reason:
              error instanceof Error ? error.message : 'Could not read this workbook.',
          },
        ],
      });
    } finally {
      setParsing(false);
    }
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadContractExcelTemplate();
    } finally {
      setDownloading(false);
    }
  };

  const runImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;

    const stationError = contractImportStationMismatch(
      billingStationCodeFromSession(),
      parsed.rows.map((row) => row.payload.contractNumber),
      file?.name,
    );
    if (stationError) {
      setSummary({
        created: 0,
        updated: 0,
        activated: 0,
        failed: [],
        clientErrors: [{ rowNumber: 0, reason: stationError }],
      });
      return;
    }

    setImporting(true);
    const failed: ImportSummary['failed'] = [];
    let created = 0;
    let updated = 0;
    const activated = 0;

    try {
      // 1. Fetch existing contracts to check for duplicates / updates
      const listRes = await api.listContracts();
      const extractContractsArray = (res: unknown): Array<{
        _id: string;
        contractNumber?: string;
        status?: string;
        adsEquipmentRules?: Array<{ serviceCode: string }>;
        clauses?: Array<{ clauseType: string }>;
      }> => {
        if (Array.isArray(res)) return res as any;
        if (!res || typeof res !== 'object') return [];
        const obj = res as Record<string, unknown>;
        if (Array.isArray(obj.items)) return obj.items as any;
        if (Array.isArray(obj.data)) return obj.data as any;
        if (obj.data && typeof obj.data === 'object') {
          const inner = obj.data as Record<string, unknown>;
          if (Array.isArray(inner.items)) return inner.items as any;
        }
        return [];
      };

      const existingContracts = extractContractsArray(listRes);

      const existingByNumber = new Map<string, typeof existingContracts[number]>();
      for (const c of existingContracts) {
        if (c.contractNumber) {
          existingByNumber.set(c.contractNumber.trim().toUpperCase(), c);
        }
      }

      for (const row of parsed.rows) {
        try {
          const { activate: _activate, hasContractsSheetData, ...payload } = row.payload;
          const contractKey = payload.contractNumber.trim().toUpperCase();
          const existingContract = existingByNumber.get(contractKey);

          if (existingContract) {
            // Contract ALREADY EXISTS on UI -> update & merge inside same contract
            const updateBody: Record<string, unknown> = {};

            if (hasContractsSheetData) {
              if (payload.customerCode) updateBody.customerCode = payload.customerCode;
              if (payload.category) updateBody.category = payload.category;
              if (payload.priceValidFrom) updateBody.priceValidFrom = payload.priceValidFrom;
              if (payload.priceValidTo) updateBody.priceValidTo = payload.priceValidTo;
              if (payload.aircraftTypes) updateBody.aircraftTypes = payload.aircraftTypes;
              if (payload.cancellationWithinHours != null) {
                updateBody.cancellationWithinHours = payload.cancellationWithinHours;
              }
              if (payload.conditionalCharges) {
                updateBody.conditionalCharges = payload.conditionalCharges;
              }
            }

            if (payload.adsEquipmentRules && payload.adsEquipmentRules.length > 0) {
              updateBody.adsBillingEnabled = true;
              const existingRules = [...(existingContract.adsEquipmentRules ?? [])];
              for (const newRule of payload.adsEquipmentRules) {
                const idx = existingRules.findIndex(
                  (r) =>
                    r.serviceCode?.trim().toUpperCase() ===
                    newRule.serviceCode?.trim().toUpperCase(),
                );
                if (idx >= 0) {
                  existingRules[idx] = { ...existingRules[idx], ...newRule };
                } else {
                  existingRules.push(newRule);
                }
              }
              updateBody.adsEquipmentRules = existingRules;
            }

            if (payload.clauses && payload.clauses.length > 0) {
              const existingClauses = [...(existingContract.clauses ?? [])];
              for (const newClause of payload.clauses) {
                const idx = existingClauses.findIndex(
                  (c) => c.clauseType === newClause.clauseType,
                );
                if (idx >= 0) {
                  existingClauses[idx] = { ...existingClauses[idx], ...newClause };
                } else {
                  existingClauses.push(newClause);
                }
              }
              updateBody.clauses = existingClauses;
            }

            await api.updateContract(existingContract._id, updateBody);
            updated += 1;
          } else {
            // New Contract
            if (
              !hasContractsSheetData &&
              (!payload.customerCode ||
                !payload.category ||
                !payload.priceValidFrom ||
                !payload.priceValidTo)
            ) {
              failed.push({
                rowNumber: row.rowNumber,
                contractNumber: payload.contractNumber,
                reason: `Contract "${payload.contractNumber}" does not exist yet. Include a row on the Contracts sheet with Customer Code, Category, and Valid From/To dates to create it.`,
              });
              continue;
            }

            await api.createContract(payload as Record<string, unknown>);
            created += 1;
          }
        } catch (error) {
          failed.push({
            rowNumber: row.rowNumber,
            contractNumber: row.payload.contractNumber,
            reason:
              error instanceof Error ? error.message : 'Failed to process contract.',
          });
        }
      }

      const result: ImportSummary = {
        created,
        updated,
        activated,
        failed,
        clientErrors: parsed.errors,
      };
      setSummary(result);

      if (created > 0 || updated > 0) await onImported();
    } finally {
      setImporting(false);
    }
  };

  const previewRows = parsed?.rows.slice(0, 5) ?? [];
  const totalIssues =
    (parsed?.errors.length ?? 0) + (summary?.failed.length ?? 0) + (summary?.clientErrors.length ?? 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!importing) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(92vh,44rem)] max-w-lg gap-0 overflow-hidden !border-[color:var(--billing-border-strong)] !bg-[#ffffff] p-0 !text-[color:var(--billing-text)] sm:rounded-xl">
        <DialogHeader className="space-y-1 border-b border-gray-100 px-6 py-4 text-left">
          <DialogTitle>Import contracts from Excel</DialogTitle>
          <DialogDescription>
            All 3 sheets (Contracts, ADS Rules, Clauses) are optional. If a contract already exists,
            new rules or clauses will be merged directly into it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download template
            </button>
          </div>

          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => void selectFile(e.target.files?.[0] ?? null)}
          />

          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void selectFile(dropped);
            }}
            className={`flex min-h-[7rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-colors ${
              dragging
                ? 'border-[color:var(--billing-accent)] bg-[color:var(--billing-accent-soft)]'
                : 'border-gray-200 text-gray-600 hover:border-[color:var(--billing-accent)] hover:bg-[color:var(--billing-accent-soft)]/40'
            }`}
          >
            {parsing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-[color:var(--billing-accent-strong)]" />
                <span>Reading workbook…</span>
              </>
            ) : file ? (
              <>
                <FileSpreadsheet className="h-5 w-5 text-[color:var(--billing-accent-strong)]" />
                <span className="font-medium text-gray-800">{file.name}</span>
                <span className="text-xs text-gray-500">Click or drop to replace</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span>Drop .xlsx here or click to browse</span>
              </>
            )}
          </label>

          {parsed && parsed.rows.length > 0 ? (
            <div className="rounded-lg border border-[color:var(--billing-accent-border)] bg-[#f7fac8] px-3 py-2 text-sm text-[color:var(--billing-heading)]">
              <p className="font-medium">
                Found {parsed.rows.length} contract
                {parsed.rows.length === 1 ? '' : 's'} in file
              </p>
              {previewRows.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  {previewRows.map((row: ParsedContractExcelRow) => (
                    <li key={`${row.rowNumber}-${row.payload.contractNumber}`}>
                      <strong>{row.payload.contractNumber}</strong>
                      {row.payload.customerCode ? ` — ${row.payload.customerCode}` : ''}
                      {row.payload.adsEquipmentRules?.length
                        ? ` · ${row.payload.adsEquipmentRules.length} ADS rule(s)`
                        : ''}
                      {row.payload.clauses?.length
                        ? ` · ${row.payload.clauses.length} clause(s)`
                        : ''}
                    </li>
                  ))}
                  {parsed.rows.length > previewRows.length ? (
                    <li className="text-gray-500">
                      +{parsed.rows.length - previewRows.length} more…
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          {parsed && parsed.errors.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {parsed.errors.length} issue
                {parsed.errors.length === 1 ? '' : 's'} in workbook
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {parsed.errors.slice(0, 4).map((issue) => (
                  <li key={`parse-${issue.rowNumber}-${issue.reason}`}>
                    Row {issue.rowNumber}: {issue.reason}
                  </li>
                ))}
                {parsed.errors.length > 4 ? (
                  <li>+{parsed.errors.length - 4} more…</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {summary ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                summary.failed.length === 0 && summary.clientErrors.length === 0
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <p className="flex items-center gap-2 font-medium">
                {summary.failed.length === 0 && summary.clientErrors.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                {summary.created > 0 && summary.updated > 0
                  ? `Created ${summary.created} contract(s), updated ${summary.updated} contract(s)`
                  : summary.created > 0
                    ? `Created ${summary.created} contract(s)`
                    : summary.updated > 0
                      ? `Updated ${summary.updated} contract(s)`
                      : 'Import completed'}
                {summary.activated > 0
                  ? ` (${summary.activated} activated)`
                  : ''}
              </p>
              {summary.failed.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {summary.failed.slice(0, 4).map((issue) => (
                    <li key={`fail-${issue.rowNumber}-${issue.contractNumber}`}>
                      {issue.contractNumber}: {issue.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-gray-100 px-6 py-4 sm:justify-between">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={importing}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {summary && totalIssues === 0 && (summary.created > 0 || summary.updated > 0)
              ? 'Done'
              : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={
              importing ||
              parsing ||
              !parsed ||
              parsed.rows.length === 0 ||
              (summary != null &&
                summary.failed.length === 0 &&
                (summary.created > 0 || summary.updated > 0))
            }
            onClick={() => void runImport()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import {parsed?.rows.length ?? 0} contract
                {(parsed?.rows.length ?? 0) === 1 ? '' : 's'}
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
