import {
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
  getApiBase,
  fetchAllPanelAccounts,
  type PanelUserListItem,
} from '@/lib/api';
import type {
  DepartmentAnalyticsRecord,
  DepartmentFormInput,
  DepartmentNavigationPermissions,
} from '@/lib/departmentAnalyticsMock';

export const ADMIN_DEPARTMENTS_PATH = 'admin-departments';

export type DepartmentManagerRole = 'Super Admin' | 'Manager';

export type DepartmentManagerOption = {
  id: string;
  accountKind: 'user' | 'admin';
  name: string;
  employeeId: string;
  roleLabel: DepartmentManagerRole;
  label: string;
};

function normalizeRoleToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function resolveManagerRoleFromTokens(
  ...tokens: unknown[]
): DepartmentManagerRole | null {
  const normalized = tokens.map(normalizeRoleToken).filter(Boolean);
  if (normalized.some((token) => token === 'superadmin')) return 'Super Admin';
  if (normalized.some((token) => token === 'manager' || token === 'admin' || token === 'operations')) {
    return 'Manager';
  }
  return null;
}

function mapManagerOptionRow(row: Record<string, unknown>): DepartmentManagerOption | null {
  const id = String(row.id ?? '').trim();
  const name = String(row.name ?? '').trim();
  const employeeId = String(row.employeeId ?? '').trim() || id;
  const roleLabel = row.roleLabel === 'Super Admin' ? 'Super Admin' : row.roleLabel === 'Manager' ? 'Manager' : null;
  const accountKind = row.accountKind === 'admin' ? 'admin' : 'user';

  if (!id || !name || !roleLabel) return null;

  return {
    id,
    accountKind,
    name,
    employeeId,
    roleLabel,
    label: `${name} (${employeeId})`,
  };
}

async function fetchManagerOptionsFromApi(): Promise<DepartmentManagerOption[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/admin-departments/manager-options`, {
    method: 'GET',
    credentials: 'include',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  const rows: unknown[] = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map((row) => mapManagerOptionRow(row as Record<string, unknown>))
    .filter((row): row is DepartmentManagerOption => row !== null);
}

function panelAccountToManagerOption(
  account: PanelUserListItem,
): DepartmentManagerOption | null {
  const roleLabel = resolveManagerRoleFromTokens(
    account.authorizationRole,
    account.role,
  );
  if (!roleLabel) return null;

  const accountKind = account.accountKind === 'admin' ? 'admin' : 'user';
  const employeeId =
    String(account.employeeId ?? '').trim() ||
    String(account.userid ?? '').trim() ||
    String(account.admNumber ?? '').trim() ||
    account.id;

  return {
    id: account.id,
    accountKind,
    name: account.name,
    employeeId,
    roleLabel,
    label: `${account.name} (${employeeId})`,
  };
}

export async function fetchDepartmentManagerOptions(): Promise<DepartmentManagerOption[]> {
  try {
    return await fetchManagerOptionsFromApi();
  } catch {
    const accounts = await fetchAllPanelAccounts().catch(
      () => [] as PanelUserListItem[],
    );
    const byKey = new Map<string, DepartmentManagerOption>();

    for (const account of accounts) {
      const option = panelAccountToManagerOption(account);
      if (option) byKey.set(`${option.accountKind}:${option.id}`, option);
    }

    return [...byKey.values()].sort((a, b) => {
      const roleOrder = a.roleLabel === b.roleLabel ? 0 : a.roleLabel === 'Super Admin' ? -1 : 1;
      if (roleOrder !== 0) return roleOrder;
      return a.name.localeCompare(b.name);
    });
  }
}

export function mapDepartmentRecord(doc: unknown): DepartmentAnalyticsRecord {
  const normalized = advanceDocId(doc as Record<string, unknown>);
  const weekly = Array.isArray(normalized.weeklyPerformance)
    ? normalized.weeklyPerformance.map((v) => Number(v))
    : [70, 72, 74, 76, 78, 80, 82];

  return {
    id: normalized.id,
    name: String(normalized.name ?? '').trim(),
    subDepartment: normalized.subDepartment
      ? String(normalized.subDepartment).trim()
      : undefined,
    subDepartments: Array.isArray(normalized.subDepartments)
      ? normalized.subDepartments.map((value) => String(value).trim()).filter(Boolean)
      : normalized.subDepartment
        ? [String(normalized.subDepartment).trim()]
        : [],
    assignedStationIds: Array.isArray(normalized.assignedStationIds)
      ? normalized.assignedStationIds.map((value) => String(value).trim()).filter(Boolean)
      : [],
    departmentCode: String(normalized.departmentCode ?? '').trim(),
    status: (normalized.status as DepartmentAnalyticsRecord['status']) ?? 'Active',
    managerId: String(normalized.managerId ?? ''),
    managerName: String(normalized.managerName ?? ''),
    managerInitials: String(normalized.managerInitials ?? ''),
    headcountSeed:
      normalized.headcountSeed != null ? Number(normalized.headcountSeed) : undefined,
    attendancePct: Number(normalized.attendancePct ?? 0),
    performancePct: Number(normalized.performancePct ?? 0),
    taskCompletionPct: Number(normalized.taskCompletionPct ?? 0),
    weeklyPerformance: weekly.slice(0, 7) as DepartmentAnalyticsRecord['weeklyPerformance'],
    insight: String(normalized.insight ?? ''),
    budgetUsd: Number(normalized.budgetUsd ?? 0),
    accent: (normalized.accent as DepartmentAnalyticsRecord['accent']) ?? 'emerald',
    description: normalized.description
      ? String(normalized.description).trim()
      : undefined,
    permissions: normalized.permissions as DepartmentNavigationPermissions | undefined,
    createdAt:
      typeof normalized.createdAt === 'string'
        ? normalized.createdAt
        : normalized.createdAt instanceof Date
          ? normalized.createdAt.toISOString()
          : undefined,
  };
}

export function departmentFormToPayload(
  form: DepartmentFormInput,
): Record<string, unknown> {
  return {
    name: form.name.trim(),
    subDepartment: form.subDepartments?.[0]?.trim() || form.subDepartment?.trim() || undefined,
    subDepartments: (form.subDepartments ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
    assignedStationIds: (form.assignedStationIds ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
    departmentCode: form.departmentCode.trim(),
    managerId: form.managerId,
    managerName: form.managerName,
    managerInitials: form.managerInitials,
    status: form.status ?? 'Active',
    headcountSeed: form.headcountSeed ?? 0,
    description: form.description?.trim() || undefined,
    permissions: form.permissions ?? { accessTabs: [], accessSubPages: {} },
  };
}

export async function fetchAdminDepartments(
  filter?: string,
): Promise<DepartmentAnalyticsRecord[]> {
  const rows = await advanceList(ADMIN_DEPARTMENTS_PATH, filter ? { filter } : undefined);
  return rows.map(mapDepartmentRecord);
}

export async function createAdminDepartment(
  form: DepartmentFormInput,
): Promise<DepartmentAnalyticsRecord> {
  const created = await advanceCreate(ADMIN_DEPARTMENTS_PATH, departmentFormToPayload(form));
  return mapDepartmentRecord(created);
}

export async function updateAdminDepartment(
  id: string,
  form: DepartmentFormInput,
): Promise<DepartmentAnalyticsRecord> {
  const updated = await advanceUpdate(ADMIN_DEPARTMENTS_PATH, id, departmentFormToPayload(form));
  return mapDepartmentRecord(updated);
}

export async function deleteAdminDepartment(id: string): Promise<void> {
  await advanceDelete(ADMIN_DEPARTMENTS_PATH, id);
}

/** Fired after admin departments are created, updated, or deleted. */
export const ADMIN_DEPARTMENTS_CHANGED_EVENT = 'fris:admin-departments-changed';

export function notifyAdminDepartmentsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_DEPARTMENTS_CHANGED_EVENT));
}
