'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { advanceBulkCreate } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  downloadStaffExcelTemplate,
  parseAdvanceStaffExcel,
} from '@/components/fris/advance/importAdvanceStaffExcel';
import {
  GATEWAY_GET_BTN,
  GATEWAY_SECONDARY_BTN,
} from '@/components/fris/advance/gatewayPageLayout';

type StaffImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  onImported: () => Promise<void> | void;
};

export function StaffImportDialog({
  open,
  onOpenChange,
  path,
  onImported,
}: StaffImportDialogProps) {
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);

  const resetFile = () => {
    setExcelFile(null);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!excelFile) return;
    setExcelImporting(true);
    try {
      const { rows: parsedRows, skipped } = await parseAdvanceStaffExcel(excelFile);
      if (parsedRows.length === 0) {
        const reason = skipped[0]?.reason ?? 'No valid rows found in the Excel file.';
        toast.error(reason);
        return;
      }

      const toCreate = parsedRows.map(({ payload }) => payload);
      const result = (await advanceBulkCreate(path, { rows: toCreate })) as {
        upsertedCount?: number;
        modifiedCount?: number;
        matchedCount?: number;
        skipped?: number;
      };

      const upserted = result.upsertedCount ?? 0;
      const modified = result.modifiedCount ?? 0;
      const saved = upserted + modified;
      const serverSkipped = result.skipped ?? 0;

      await onImported();

      if (saved > 0 || upserted > 0 || toCreate.length > 0) {
        const totalTouched = saved > 0 ? saved : toCreate.length;
        toast.success(
          `Imported ${totalTouched} staff row${totalTouched === 1 ? '' : 's'} for this station` +
            (upserted || modified
              ? ` (${upserted} new, ${modified} updated).`
              : '.'),
        );
        onOpenChange(false);
        resetFile();
      } else {
        toast.error('Excel import did not save any staff rows.');
      }

      const totalSkipped = skipped.length + serverSkipped;
      if (totalSkipped > 0) {
        toast.message(
          `Skipped ${totalSkipped} row${totalSkipped === 1 ? '' : 's'} (invalid or empty).`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel import failed');
    } finally {
      setExcelImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetFile();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md border-gray-200 bg-white duration-[180ms] ease-out data-[state=open]:zoom-in-95">
        <DialogHeader>
          <DialogTitle>Import staff from Excel</DialogTitle>
          <DialogDescription>
            Rows save to the <strong>logged-in station</strong> only. Same Employee ID
            updates the existing row (no duplicates). Employee Name must be plain text
            in Excel. Download the sample for the correct columns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="staff-excel-import-modal"
          />
          <label
            htmlFor="staff-excel-import-modal"
            className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 text-sm text-gray-600 transition hover:border-emerald-400 hover:bg-emerald-50/50"
          >
            <Upload className="h-4 w-4" />
            Choose Excel file
          </label>
          <p className="truncate text-center text-sm text-gray-500">
            {excelFile ? excelFile.name : 'No file chosen'}
          </p>
          <button
            type="button"
            onClick={() => void downloadStaffExcelTemplate()}
            className="mx-auto block text-sm font-medium text-emerald-700 underline-offset-2 hover:underline"
          >
            Download sample Excel
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={excelImporting}
            className={GATEWAY_SECONDARY_BTN}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!excelFile || excelImporting}
            className={GATEWAY_GET_BTN}
          >
            {excelImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
            )}
            {excelImporting ? 'Importing…' : 'Import'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
