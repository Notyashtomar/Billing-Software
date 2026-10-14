import {
  fetchAllPanelAccounts,
  fetchPanelAdmins,
  fetchPanelUsers,
  type PanelUserListItem,
} from '@/lib/api';
import { fetchAdminDepartments } from '@/lib/admin-departments-api';
import { fetchAdminStations } from '@/lib/admin-stations-api';
import { fetchAdminSupportTickets } from '@/lib/support-tickets-api';
import {
  fetchExportUserActivityLog,
  fetchUserRegistrationWorkspace,
} from '@/lib/user-registration-api';
import type { AdminPanelSection } from '@/lib/admin-nav-config';

export type AdminExportDatasetId =
  | 'users'
  | 'admins'
  | 'admins_detailed'
  | 'admins_new'
  | 'all_accounts'
  | 'training'
  | 'departments'
  | 'stations'
  | 'tickets_open'
  | 'tickets_closed'
  | 'tickets_all'
  | 'registration_invites'
  | 'registration_users'
  | 'registration_pending'
  | 'registration_activity'
  | 'users_activity_log';

export type AdminExportPageId =
  | Exclude<AdminPanelSection, 'dashboard' | 'export' | 'system-check'>
  | 'registration'
  | 'activity'
  | 'admins';

export type AdminExportPage = {
  id: AdminExportPageId;
  label: string;
};

export const ADMIN_EXPORT_PAGES: AdminExportPage[] = [
  { id: 'users', label: 'Users' },
  { id: 'registration', label: 'Registration' },
  { id: 'activity', label: 'Activity logs' },
  { id: 'admins', label: 'Admin accounts' },
  { id: 'departments', label: 'Department' },
  { id: 'stations', label: 'Stations' },
  { id: 'training', label: 'Training' },
  { id: 'tickets', label: 'Raise ticket query' },
];

export type AdminExportDataset = {
  id: AdminExportDatasetId;
  label: string;
  description: string;
  sourcePage: AdminExportPageId;
  group: string;
};

export const ADMIN_EXPORT_DATASETS: AdminExportDataset[] = [
  {
    id: 'users',
    label: 'Employees',
    description: 'All employee accounts from the Users page.',
    sourcePage: 'users',
    group: 'Users',
  },
  {
    id: 'admins',
    label: 'Admin accounts',
    description: 'Admin panel login accounts.',
    sourcePage: 'admins',
    group: 'Admin accounts',
  },
  {
    id: 'admins_detailed',
    label: 'Admin accounts (detailed)',
    description: 'Admin logins with roles, permissions, and creation dates.',
    sourcePage: 'admins',
    group: 'Admin accounts',
  },
  {
    id: 'admins_new',
    label: 'New admin accounts',
    description: 'Admin accounts created in the last 90 days.',
    sourcePage: 'admins',
    group: 'Admin accounts',
  },
  {
    id: 'all_accounts',
    label: 'All panel accounts',
    description: 'Employees and admins combined.',
    sourcePage: 'users',
    group: 'Users',
  },
  {
    id: 'registration_invites',
    label: 'Registration invites',
    description: 'Outstanding and completed onboarding invite links.',
    sourcePage: 'registration',
    group: 'Registration',
  },
  {
    id: 'registration_users',
    label: 'Registered users',
    description: 'Users created through invite-based registration.',
    sourcePage: 'registration',
    group: 'Registration',
  },
  {
    id: 'registration_pending',
    label: 'Pending approvals',
    description: 'Submitted registrations awaiting admin approval.',
    sourcePage: 'registration',
    group: 'Registration',
  },
  {
    id: 'registration_activity',
    label: 'Registration activity log',
    description: 'Recent onboarding and approval events.',
    sourcePage: 'registration',
    group: 'Registration',
  },
  {
    id: 'users_activity_log',
    label: 'User activity log (per user)',
    description: 'Full onboarding and account event history for each user.',
    sourcePage: 'activity',
    group: 'Activity logs',
  },
  {
    id: 'departments',
    label: 'Departments',
    description: 'Department directory with manager and headcount.',
    sourcePage: 'departments',
    group: 'Departments',
  },
  {
    id: 'stations',
    label: 'Stations',
    description: 'Station records with location and operations metrics.',
    sourcePage: 'stations',
    group: 'Stations',
  },
  {
    id: 'training',
    label: 'Training records',
    description: 'Employee training certifications from registration.',
    sourcePage: 'training',
    group: 'Training',
  },
  {
    id: 'tickets_open',
    label: 'Open support tickets',
    description: 'Unresolved raise-ticket queries.',
    sourcePage: 'tickets',
    group: 'Support tickets',
  },
  {
    id: 'tickets_closed',
    label: 'Closed support tickets',
    description: 'Resolved raise-ticket queries.',
    sourcePage: 'tickets',
    group: 'Support tickets',
  },
  {
    id: 'tickets_all',
    label: 'All support tickets',
    description: 'Open and closed tickets combined.',
    sourcePage: 'tickets',
    group: 'Support tickets',
  },
];

export type AdminExportResult = {
  id: AdminExportDatasetId;
  label: string;
  rows: Record<string, unknown>[];
};

function formatTrainings(user: PanelUserListItem): string {
  const entries = user.trainings?.length
    ? user.trainings
    : user.trainingTitle
      ? [{ id: 'legacy', title: user.trainingTitle }]
      : [];
  return entries
    .map((entry) => entry.title?.trim())
    .filter(Boolean)
    .join('; ');
}

function adminDetailedRow(admin: PanelUserListItem): Record<string, unknown> {
  const tabs = admin.permissions?.accessTabs ?? [];
  return {
    id: admin.id,
    userid: admin.userid,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    status: admin.status,
    accessTabs: tabs.join('; '),
    accessSubPages: JSON.stringify(admin.permissions?.accessSubPages ?? {}),
    tabCount: tabs.length,
    createdAt: admin.createdAt ?? '',
  };
}

function isRecentAdmin(createdAt: string | undefined, withinDays = 90): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  return created >= cutoff;
}

function panelUserToRow(user: PanelUserListItem): Record<string, unknown> {
  return {
    employeeId: user.employeeId,
    name: user.name,
    email: user.email,
    companyEmail: user.companyEmail ?? '',
    userid: user.userid,
    accountKind: user.accountKind ?? 'user',
    role: user.role,
    department: user.department,
    subDepartment: user.subDepartment ?? '',
    designation: user.designation,
    station: user.station ?? '',
    company: user.company ?? '',
    phone: user.phone ?? '',
    gender: user.gender ?? '',
    dob: user.dob ?? '',
    joiningDate: user.joiningDate ?? '',
    status: user.status,
    residence: user.residence ?? '',
    state: user.state ?? '',
    pincode: user.pincode ?? '',
    country: user.country ?? '',
    trainings: formatTrainings(user),
    createdAt: user.createdAt ?? '',
  };
}

function buildTrainingRows(users: PanelUserListItem[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  for (const user of users) {
    const trainings = user.trainings?.length
      ? user.trainings
      : user.trainingTitle
        ? [{ id: 'legacy', title: user.trainingTitle }]
        : [];

    for (const training of trainings) {
      const title = training.title?.trim();
      if (!title) continue;
      rows.push({
        employeeId: user.employeeId,
        name: user.name,
        department: user.department,
        station: user.station ?? '',
        designation: user.designation,
        trainingTitle: title,
        status: user.status,
      });
    }
  }

  return rows;
}

async function departmentRows(): Promise<Record<string, unknown>[]> {
  const [departments, users] = await Promise.all([
    fetchAdminDepartments(),
    fetchPanelUsers(),
  ]);
  const userCounts = new Map<string, number>();
  for (const user of users) {
    const key = user.department?.trim();
    if (key) userCounts.set(key, (userCounts.get(key) ?? 0) + 1);
  }

  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    subDepartment: department.subDepartment ?? '',
    departmentCode: department.departmentCode,
    status: department.status,
    managerName: department.managerName,
    headcount: Math.max(userCounts.get(department.name) ?? 0, department.headcountSeed ?? 0),
    attendancePct: department.attendancePct,
    performancePct: department.performancePct,
    taskCompletionPct: department.taskCompletionPct,
    budgetUsd: department.budgetUsd,
    description: department.description ?? '',
    createdAt: department.createdAt ?? '',
  }));
}

async function stationRows(): Promise<Record<string, unknown>[]> {
  const stations = await fetchAdminStations();
  return stations.map((station) => ({
    id: station.id,
    name: station.name,
    code: station.code,
    company: station.company,
    region: station.region,
    city: station.city,
    state: station.state ?? '',
    pincode: station.pincode ?? '',
    type: station.type,
    status: station.status,
    manager: station.manager,
    capacity: station.capacity,
    departmentCount: station.departmentCount ?? '',
    activeStaff: station.activeStaff,
    dailyOps: station.dailyOps,
    efficiencyPct: station.efficiencyPct,
    delayedOps: station.delayedOps,
    updatedAt: station.updatedAt,
  }));
}

function ticketRows(
  tickets: Array<Record<string, unknown>>,
): Record<string, unknown>[] {
  return tickets.map((ticket) => ({
    ticketNumber: ticket.ticketNumber ?? '',
    status: ticket.status ?? '',
    raisedAt: ticket.raisedAt ?? '',
    closedAt: ticket.closedAt ?? '',
    navigationPageLabel: ticket.navigationPageLabel ?? '',
    subPageLabel: ticket.subPageLabel ?? '',
    urgency: ticket.urgency ?? '',
    issueType: ticket.issueType ?? '',
    issueReason: ticket.issueReason ?? '',
    raisedByName: ticket.raisedByName ?? '',
    raisedByEmail: ticket.raisedByEmail ?? '',
    raisedByUserid: ticket.raisedByUserid ?? '',
    adminResolutionNote: ticket.adminResolutionNote ?? '',
    adminResolvedAt: ticket.adminResolvedAt ?? '',
    resolvedByAdminName: ticket.resolvedByAdminName ?? '',
  }));
}

export async function loadAdminExportDataset(
  id: AdminExportDatasetId,
): Promise<AdminExportResult> {
  const meta = ADMIN_EXPORT_DATASETS.find((dataset) => dataset.id === id);
  if (!meta) {
    throw new Error(`Unknown export dataset: ${id}`);
  }

  switch (id) {
    case 'users': {
      const users = await fetchPanelUsers();
      return { id, label: meta.label, rows: users.map(panelUserToRow) };
    }
    case 'admins': {
      const admins = await fetchPanelAdmins();
      return { id, label: meta.label, rows: admins.map(panelUserToRow) };
    }
    case 'admins_detailed': {
      const admins = await fetchPanelAdmins();
      return { id, label: meta.label, rows: admins.map(adminDetailedRow) };
    }
    case 'admins_new': {
      const admins = await fetchPanelAdmins();
      return {
        id,
        label: meta.label,
        rows: admins.filter((admin) => isRecentAdmin(admin.createdAt)).map(adminDetailedRow),
      };
    }
    case 'users_activity_log': {
      const rows = await fetchExportUserActivityLog();
      return { id, label: meta.label, rows };
    }
    case 'all_accounts': {
      const accounts = await fetchAllPanelAccounts();
      return { id, label: meta.label, rows: accounts.map(panelUserToRow) };
    }
    case 'training': {
      const users = await fetchPanelUsers();
      return { id, label: meta.label, rows: buildTrainingRows(users) };
    }
    case 'departments':
      return { id, label: meta.label, rows: await departmentRows() };
    case 'stations':
      return { id, label: meta.label, rows: await stationRows() };
    case 'tickets_open': {
      const { tickets } = await fetchAdminSupportTickets(undefined, 'open');
      return { id, label: meta.label, rows: ticketRows(tickets) };
    }
    case 'tickets_closed': {
      const { tickets } = await fetchAdminSupportTickets(undefined, 'closed');
      return { id, label: meta.label, rows: ticketRows(tickets) };
    }
    case 'tickets_all': {
      const [open, closed] = await Promise.all([
        fetchAdminSupportTickets(undefined, 'open'),
        fetchAdminSupportTickets(undefined, 'closed'),
      ]);
      return {
        id,
        label: meta.label,
        rows: ticketRows([...open.tickets, ...closed.tickets]),
      };
    }
    case 'registration_invites':
    case 'registration_users':
    case 'registration_pending':
    case 'registration_activity': {
      const workspace = await fetchUserRegistrationWorkspace();
      if (id === 'registration_invites') {
        return {
          id,
          label: meta.label,
          rows: workspace.invites.map((invite) => ({
            name: invite.name ?? '',
            employeeId: invite.employeeId ?? '',
            email: invite.email,
            inviteCode: invite.inviteCode,
            status: invite.status,
            invitedRole: invite.invitedRole,
            department: invite.department ?? '',
            company: invite.company ?? '',
            station: invite.station ?? '',
            completionPercent: invite.completionPercent,
            sentCount: invite.sentCount,
            expiresAt: invite.expiresAt,
            lastOpenedAt: invite.lastOpenedAt ?? '',
            createdAt: invite.createdAt ?? '',
          })),
        };
      }
      if (id === 'registration_users') {
        return {
          id,
          label: meta.label,
          rows: workspace.users.map((user) => ({
            employeeId: user.employeeId,
            name: user.name,
            email: user.email,
            companyEmail: user.companyEmail ?? '',
            role: user.role,
            department: user.department ?? '',
            subDepartment: user.subDepartment ?? '',
            designation: user.designation ?? '',
            company: user.company ?? '',
            station: user.station ?? '',
            accountStatus: user.accountStatus,
            approvalStatus: user.approvalStatus,
            isActive: user.isActive,
            createdAt: user.createdAt ?? '',
          })),
        };
      }
      if (id === 'registration_pending') {
        return {
          id,
          label: meta.label,
          rows: workspace.pendingApprovals.map((user) => ({
            employeeId: user.employeeId,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department ?? '',
            designation: user.designation ?? '',
            company: user.company ?? '',
            station: user.station ?? '',
            approvalStatus: user.approvalStatus,
            createdAt: user.createdAt ?? '',
          })),
        };
      }
      return {
        id,
        label: meta.label,
        rows: workspace.activity.map((entry) => ({
          action: entry.action,
          actorType: entry.actorType,
          actorLabel: entry.actorLabel ?? '',
          inviteId: entry.inviteId ?? '',
          userId: entry.userId ?? '',
          createdAt: entry.createdAt ?? '',
          metadata: JSON.stringify(entry.metadata ?? {}),
        })),
      };
    }
    default:
      throw new Error(`Unhandled export dataset: ${id}`);
  }
}

export async function loadAdminExportDatasets(
  ids: AdminExportDatasetId[],
): Promise<AdminExportResult[]> {
  const results: AdminExportResult[] = [];
  for (const id of ids) {
    results.push(await loadAdminExportDataset(id));
  }
  return results;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
  }
  return lines.join('\r\n');
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadAdminExports(
  ids: AdminExportDatasetId[],
): Promise<{ fileCount: number; totalRows: number }> {
  if (!ids.length) {
    throw new Error('Select at least one dataset to export.');
  }

  const datasets = await loadAdminExportDatasets(ids);
  const totalRows = datasets.reduce((sum, dataset) => sum + dataset.rows.length, 0);
  const date = stamp();

  for (let index = 0; index < datasets.length; index += 1) {
    const dataset = datasets[index];
    const csv = rowsToCsv(dataset.rows);
    downloadTextFile(
      csv || 'No data',
      `fris-${dataset.id}-${date}.csv`,
      'text/csv;charset=utf-8',
    );
    if (index < datasets.length - 1) {
      await wait(250);
    }
  }

  return { fileCount: datasets.length, totalRows };
}

export function getExportDatasetsByGroup(): Array<{
  group: string;
  datasets: AdminExportDataset[];
}> {
  const groups = new Map<string, AdminExportDataset[]>();
  for (const dataset of ADMIN_EXPORT_DATASETS) {
    const list = groups.get(dataset.group) ?? [];
    list.push(dataset);
    groups.set(dataset.group, list);
  }
  return Array.from(groups.entries()).map(([group, datasets]) => ({ group, datasets }));
}

export function getExportDatasetsForPage(page: AdminExportPageId): AdminExportDataset[] {
  return ADMIN_EXPORT_DATASETS.filter((dataset) => dataset.sourcePage === page);
}

export function getExportDatasetGroupsForPage(page: AdminExportPageId): Array<{
  group: string;
  datasets: AdminExportDataset[];
}> {
  const datasets = getExportDatasetsForPage(page);
  const groups = new Map<string, AdminExportDataset[]>();
  for (const dataset of datasets) {
    const list = groups.get(dataset.group) ?? [];
    list.push(dataset);
    groups.set(dataset.group, list);
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, datasets: items }));
}

export const ADMIN_EXPORT_PAGE_HINTS: Record<AdminExportPageId, string> = {
  users: 'Employee and admin account directories',
  'user-credentials': 'User credential reset and management logs',
  registration: 'Onboarding invites, approvals, and activity',
  activity: 'Per-user event and onboarding history',
  admins: 'Admin panel accounts, roles, and permissions',
  departments: 'Department structure, managers, and metrics',
  stations: 'Airport stations with operations data',
  training: 'Per-employee training certifications',
  tickets: 'Support queries raised from the panel',
  notifications: 'Admin notification feed exports',
  'user-activity': 'User action and audit logs',
};
