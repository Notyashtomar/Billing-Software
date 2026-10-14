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
  downloadContactExcelTemplate,
  parseAdvanceContactExcel,
} from '@/components/fris/advance/importAdvanceContactExcel';
import {
  CONTACT_BTN_TRANSITION,
  CONTACT_PRIMARY_BTN,
  CONTACT_SECONDARY_BTN,
} from '@/components/fris/advance/contactShared';

type ContactImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  onImported: () => Promise<void> | void;
};

export function ContactImportDialog({
  open,
  onOpenChange,
  path,
  onImported,
}: ContactImportDialogProps) {
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
      const { rows: parsedRows, skipped } = await parseAdvanceContactExcel(excelFile);
      if (parsedRows.length === 0) {
        const reason = skipped[0]?.reason ?? 'No valid rows found in the Excel file.';
        toast.error(reason);
        return;
      }

      const toCreate = parsedRows.map(({ payload }) => payload);
      const result = (await advanceBulkCreate(path, { rows: toCreate })) as {
        inserted?: number;
        skipped?: number;
      };
      const inserted = result.inserted ?? 0;
      const serverSkipped = result.skipped ?? 0;

      await onImported();

      if (inserted > 0) {
        toast.success(`Imported ${inserted} contact${inserted === 1 ? '' : 's'} from Excel.`);
      }
      const totalSkipped = skipped.length + serverSkipped;
      if (totalSkipped > 0) {
        toast.message(
          `Skipped ${totalSkipped} row${totalSkipped === 1 ? '' : 's'} (empty or unrecognized).`,
        );
      }
      if (inserted === 0) {
        toast.error('Excel import did not add any contacts.');
      } else {
        onOpenChange(false);
        resetFile();
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
          <DialogTitle>Import contacts from Excel</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet with any of: Email, Contact, Airline, Airline Representative,
            Mobile No., Company Name. Missing columns are left blank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="contact-excel-import-modal"
          />
          <label
            htmlFor="contact-excel-import-modal"
            className={`inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 text-sm text-gray-600 hover:border-emerald-400 hover:bg-emerald-50/50 ${CONTACT_BTN_TRANSITION}`}
          >
            <Upload className="h-4 w-4" />
            Choose Excel file
          </label>
          <p className="truncate text-center text-sm text-gray-500">
            {excelFile ? excelFile.name : 'No file chosen'}
          </p>
          <button
            type="button"
            onClick={() => void downloadContactExcelTemplate()}
            className={`mx-auto block text-sm font-medium text-emerald-600 underline-offset-2 hover:underline ${CONTACT_BTN_TRANSITION}`}
          >
            Download template
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={excelImporting}
            className={CONTACT_SECONDARY_BTN}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!excelFile || excelImporting}
            className={CONTACT_PRIMARY_BTN}
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
