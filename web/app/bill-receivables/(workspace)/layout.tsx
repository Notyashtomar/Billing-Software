'use client';

import type { ReactNode } from 'react';
import { ReceivablesShell } from '@/features/bill-receivables/ReceivablesShell';

export default function BillReceivablesWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ReceivablesShell>{children}</ReceivablesShell>;
}
