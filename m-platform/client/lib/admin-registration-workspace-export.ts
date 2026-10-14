import 'client-only';

import { format } from 'date-fns';
import type { AdminInviteRecord } from '@/lib/user-registration-api';
import { getXLSXModule } from '@/lib/dynamic-imports';
import { inviteProgressExportFields } from '@/lib/registration-invite-progress';

type ColumnDef<T> = {
  key: string;
  label: string;
  value: (row: T) => string | number | boolean;
};

function formatExportDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'dd MMM yyyy, hh:mm a');
}

function sheetFromColumns<T>(
  columns: ColumnDef<T>[],
  rows: T[],
): string[][] {
  const header = columns.map((column) => column.label);
  if (rows.length === 0) return [header];
  const body = rows.map((row) =>
    columns.map((column) => {
      const value = column.value(row);
      return value == null ? '' : String(value);
    }),
  );
  return [header, ...body];
}

const INVITE_COLUMNS: ColumnDef<AdminInviteRecord>[] = [
  { key: 'name', label: 'Name', value: (row) => row.name ?? '' },
  { key: 'employeeId', label: 'Employee ID', value: (row) => row.employeeId ?? '' },
  { key: 'email', label: 'Email', value: (row) => row.email },
  { key: 'inviteCode', label: 'Invite code', value: (row) => row.inviteCode },
  { key: 'station', label: 'Station', value: (row) => row.station ?? '' },
  { key: 'department', label: 'Department', value: (row) => row.department ?? '' },
  { key: 'company', label: 'Company', value: (row) => row.company ?? '' },
  { key: 'invitedRole', label: 'Role', value: (row) => row.invitedRole },
  { key: 'status', label: 'Status', value: (row) => row.status },
  {
    key: 'currentStep',
    label: 'Current step',
    value: (row) => inviteProgressExportFields(row).currentStep,
  },
  {
    key: 'formsFilled',
    label: 'Forms filled',
    value: (row) => inviteProgressExportFields(row).formsFilled,
  },
  {
    key: 'completionPercent',
    label: 'Completion %',
    value: (row) => inviteProgressExportFields(row).completionPercent,
  },
  {
    key: 'stepKey',
    label: 'Step key',
    value: (row) => inviteProgressExportFields(row).stepKey,
  },
  {
    key: 'expiresAt',
    label: 'Expiry',
    value: (row) => formatExportDateTime(row.expiresAt),
  },
  {
    key: 'lastOpenedAt',
    label: 'Last opened',
    value: (row) => formatExportDateTime(row.lastOpenedAt),
  },
  { key: 'sentCount', label: 'Sent count', value: (row) => row.sentCount },
  { key: 'linkedUserId', label: 'Linked user ID', value: (row) => row.linkedUserId ?? '' },
  {
    key: 'createdAt',
    label: 'Created at',
    value: (row) => formatExportDateTime(row.createdAt),
  },
  { key: 'inviteUrl', label: 'Invite URL', value: (row) => row.inviteUrl ?? '' },
];

export async function exportInviteManagementToExcel(
  invites: AdminInviteRecord[],
  fileNamePrefix = 'invite-management',
): Promise<void> {
  if (invites.length === 0) return;

  const [{ saveAs }, XLSX] = await Promise.all([
    import('file-saver'),
    getXLSXModule(),
  ]);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetFromColumns(INVITE_COLUMNS, invites));
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Invite management');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const ts = new Date().toISOString().slice(0, 10);
  saveAs(blob, `${fileNamePrefix}_${ts}.xlsx`);
}
