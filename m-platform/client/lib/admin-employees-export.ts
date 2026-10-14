import 'client-only';

import type { PanelUserListItem } from '@/lib/api';
import { getXLSXModule } from '@/lib/dynamic-imports';

const EXPORT_COLUMNS: Array<{ key: keyof PanelUserListItem | 'trainings'; label: string }> = [
  { key: 'admNumber', label: 'ADM NO' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'companyEmail', label: 'Company email' },
  { key: 'station', label: 'Station' },
  { key: 'department', label: 'Department' },
  { key: 'subDepartment', label: 'Sub-department' },
  { key: 'designation', label: 'Designation' },
  { key: 'joiningDate', label: 'Date of joining' },
  { key: 'status', label: 'Status' },
  { key: 'role', label: 'Role' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'userid', label: 'User ID' },
  { key: 'trainings', label: 'Trainings' },
];

function cellValue(user: PanelUserListItem, key: (typeof EXPORT_COLUMNS)[number]['key']): string {
  if (key === 'trainings') {
    const titles = user.trainings?.length
      ? user.trainings.map((item) => item.title?.trim()).filter(Boolean)
      : user.trainingTitle?.trim()
        ? [user.trainingTitle.trim()]
        : [];
    return titles.join('; ');
  }
  const value = user[key];
  return value == null ? '' : String(value);
}

export async function exportAdminEmployeesToExcel(
  users: PanelUserListItem[],
  fileNamePrefix = 'admin-employees',
): Promise<void> {
  if (users.length === 0) return;

  const [{ saveAs }, XLSX] = await Promise.all([
    import('file-saver'),
    getXLSXModule(),
  ]);
  const headers = EXPORT_COLUMNS.map((column) => column.label);
  const rows = users.map((user) =>
    EXPORT_COLUMNS.map((column) => cellValue(user, column.key)),
  );

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Employees');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const ts = new Date().toISOString().slice(0, 10);
  saveAs(blob, `${fileNamePrefix}_${ts}.xlsx`);
}
