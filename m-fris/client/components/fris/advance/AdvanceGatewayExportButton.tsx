'use client';

import { motion } from 'framer-motion';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import type { AdvanceGatewayExportParams } from '@/components/fris/advance/exportAdvanceGatewayExcel';

type AdvanceGatewayExportButtonProps = {
  disabled?: boolean;
  emptyMessage?: string;
  successLabel?: string;
  exportParams: AdvanceGatewayExportParams;
};

export function AdvanceGatewayExportButton({
  disabled,
  emptyMessage = 'No records to export.',
  successLabel,
  exportParams,
}: AdvanceGatewayExportButtonProps) {
  const handleExport = async () => {
    if (exportParams.rows.length === 0) {
      toast.error(emptyMessage);
      return;
    }
    try {
      const { downloadAdvanceGatewayExcel } = await import(
        '@/components/fris/advance/exportAdvanceGatewayExcel'
      );
      const count = await downloadAdvanceGatewayExcel(exportParams);
      toast.success(successLabel ?? `Exported ${count} record(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel export failed.');
    }
  };

  return (
    <motion.button
      type="button"
      onClick={() => void handleExport()}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-[transform,opacity] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-gray-50 disabled:opacity-60"
    >
      <FileSpreadsheet className="h-4 w-4" />
      Export Excel
    </motion.button>
  );
}
