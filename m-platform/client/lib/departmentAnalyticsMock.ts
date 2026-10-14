import type { PermissionTabKey } from '@/lib/permission-tab-config';

export type DepartmentStatus = 'Active' | 'Inactive';
export type DepartmentSizeBand = 'Small' | 'Medium' | 'Large';

export type DepartmentNavigationPermissions = {
  accessTabs: PermissionTabKey[];
  accessSubPages: Partial<Record<PermissionTabKey, string[]>>;
};

export type DepartmentFormInput = {
  name: string;
  subDepartment?: string;
  subDepartments?: string[];
  /** Admin-station ids where this department applies. */
  assignedStationIds?: string[];
  departmentCode: string;
  managerId: string;
  managerName: string;
  managerInitials: string;
  status?: DepartmentStatus;
  headcountSeed?: number;
  description?: string;
  permissions?: DepartmentNavigationPermissions;
};

export interface DepartmentAnalyticsRecord {
  id: string;
  name: string;
  subDepartment?: string;
  subDepartments?: string[];
  assignedStationIds?: string[];
  departmentCode: string;
  status: DepartmentStatus;
  managerId: string;
  managerName: string;
  managerInitials: string;
  /** Floor for displayed headcount when org chart has few linked users */
  headcountSeed?: number;
  attendancePct: number;
  performancePct: number;
  taskCompletionPct: number;
  weeklyPerformance: [number, number, number, number, number, number, number];
  insight: string;
  budgetUsd: number;
  accent: 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'cyan';
  description?: string;
  permissions?: DepartmentNavigationPermissions;
  createdAt?: string;
}

export const MANAGER_OPTIONS: { id: string; name: string; initials: string }[] = [
  { id: 'mgr-1', name: 'Sarah Chen', initials: 'SC' },
  { id: 'mgr-2', name: 'Marcus Webb', initials: 'MW' },
  { id: 'mgr-3', name: 'Priya Nair', initials: 'PN' },
  { id: 'mgr-4', name: 'James Okonkwo', initials: 'JO' },
  { id: 'mgr-5', name: 'Elena Rossi', initials: 'ER' },
  { id: 'mgr-6', name: 'David Park', initials: 'DP' },
];

const STORAGE_KEY = 'adminDepartmentAnalytics';

export const SEED_DEPARTMENTS: DepartmentAnalyticsRecord[] = [
  {
    id: 'dept-1',
    name: 'Operations',
    departmentCode: 'OPS-001',
    status: 'Active',
    managerId: 'mgr-6',
    managerName: 'David Park',
    managerInitials: 'DP',
    attendancePct: 91,
    performancePct: 88,
    taskCompletionPct: 86,
    weeklyPerformance: [78, 80, 82, 85, 87, 88, 88],
    insight: 'Ramp and turnaround throughput on target',
    budgetUsd: 2_100_000,
    accent: 'emerald',
    headcountSeed: 124,
  },
  {
    id: 'dept-2',
    name: 'Administration',
    departmentCode: 'ADM-102',
    status: 'Active',
    managerId: 'mgr-4',
    managerName: 'James Okonkwo',
    managerInitials: 'JO',
    attendancePct: 94,
    performancePct: 90,
    taskCompletionPct: 92,
    weeklyPerformance: [82, 84, 86, 88, 89, 90, 90],
    insight: 'HR and admin processes running smoothly',
    budgetUsd: 410_000,
    accent: 'sky',
    headcountSeed: 28,
  },
  {
    id: 'dept-3',
    name: 'Security',
    departmentCode: 'SEC-210',
    status: 'Active',
    managerId: 'mgr-2',
    managerName: 'Marcus Webb',
    managerInitials: 'MW',
    attendancePct: 96,
    performancePct: 93,
    taskCompletionPct: 94,
    weeklyPerformance: [88, 89, 90, 91, 92, 93, 93],
    insight: 'Strong compliance and vigilance coverage',
    budgetUsd: 620_000,
    accent: 'violet',
    headcountSeed: 42,
  },
  {
    id: 'dept-4',
    name: 'Safety & Quality',
    departmentCode: 'SQ-118',
    status: 'Active',
    managerId: 'mgr-1',
    managerName: 'Sarah Chen',
    managerInitials: 'SC',
    attendancePct: 93,
    performancePct: 95,
    taskCompletionPct: 91,
    weeklyPerformance: [85, 87, 89, 91, 92, 94, 95],
    insight: 'Quality audits completed ahead of schedule',
    budgetUsd: 540_000,
    accent: 'amber',
    headcountSeed: 18,
  },
  {
    id: 'dept-5',
    name: 'Finance & Accounts',
    departmentCode: 'FIN-088',
    status: 'Active',
    managerId: 'mgr-5',
    managerName: 'Elena Rossi',
    managerInitials: 'ER',
    attendancePct: 92,
    performancePct: 94,
    taskCompletionPct: 95,
    weeklyPerformance: [88, 90, 91, 93, 94, 94, 94],
    insight: 'Month-end close on track',
    budgetUsd: 480_000,
    accent: 'cyan',
    headcountSeed: 22,
  },
  {
    id: 'dept-6',
    name: 'Stores',
    departmentCode: 'STR-330',
    status: 'Active',
    managerId: 'mgr-3',
    managerName: 'Priya Nair',
    managerInitials: 'PN',
    attendancePct: 89,
    performancePct: 86,
    taskCompletionPct: 84,
    weeklyPerformance: [72, 74, 78, 80, 82, 85, 86],
    insight: 'Inventory replenishment cycle stable',
    budgetUsd: 320_000,
    accent: 'rose',
    headcountSeed: 16,
  },
  {
    id: 'dept-7',
    name: 'Management',
    departmentCode: 'MGT-401',
    status: 'Active',
    managerId: 'mgr-1',
    managerName: 'Sarah Chen',
    managerInitials: 'SC',
    attendancePct: 97,
    performancePct: 96,
    taskCompletionPct: 95,
    weeklyPerformance: [90, 91, 93, 94, 95, 96, 96],
    insight: 'Executive oversight and planning on track',
    budgetUsd: 890_000,
    accent: 'emerald',
    headcountSeed: 8,
  },
  {
    id: 'dept-8',
    name: 'MIS',
    departmentCode: 'MIS-220',
    status: 'Active',
    managerId: 'mgr-5',
    managerName: 'Elena Rossi',
    managerInitials: 'ER',
    attendancePct: 95,
    performancePct: 92,
    taskCompletionPct: 90,
    weeklyPerformance: [84, 86, 88, 89, 90, 91, 92],
    insight: 'Reporting pipelines healthy across stations',
    budgetUsd: 360_000,
    accent: 'sky',
    headcountSeed: 12,
  },
  {
    id: 'dept-9',
    name: 'Booking',
    departmentCode: 'BKG-155',
    status: 'Active',
    managerId: 'mgr-4',
    managerName: 'James Okonkwo',
    managerInitials: 'JO',
    attendancePct: 90,
    performancePct: 87,
    taskCompletionPct: 85,
    weeklyPerformance: [76, 78, 80, 82, 84, 86, 87],
    insight: 'Direct booking volume steady week over week',
    budgetUsd: 275_000,
    accent: 'violet',
    headcountSeed: 14,
  },
];

function loadStored(): DepartmentAnalyticsRecord[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DepartmentAnalyticsRecord[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadDepartmentAnalytics(): DepartmentAnalyticsRecord[] {
  const stored = loadStored();
  if (stored && stored.length) return stored;
  return SEED_DEPARTMENTS.map((d) => ({ ...d }));
}

export function persistDepartmentAnalytics(rows: DepartmentAnalyticsRecord[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function sizeBandForCount(n: number): DepartmentSizeBand {
  if (n < 12) return 'Small';
  if (n < 35) return 'Medium';
  return 'Large';
}

export function initialsFromPersonName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

export function buildNewDepartment(form: DepartmentFormInput): DepartmentAnalyticsRecord {
  const weekly: [number, number, number, number, number, number, number] = [
    70, 72, 74, 76, 78, 80, 82,
  ];
  return {
    id: `dept-${Date.now()}`,
    name: form.name,
    subDepartment: form.subDepartment,
    subDepartments: form.subDepartments,
    assignedStationIds: form.assignedStationIds ?? [],
    departmentCode: form.departmentCode,
    status: form.status ?? 'Active',
    managerId: form.managerId,
    managerName: form.managerName,
    managerInitials: form.managerInitials,
    attendancePct: 88,
    performancePct: 85,
    taskCompletionPct: 78,
    weeklyPerformance: weekly,
    insight: 'New department — baseline metrics calibrating',
    budgetUsd: 400_000,
    accent: 'emerald',
    headcountSeed: form.headcountSeed,
    description: form.description,
    permissions: form.permissions,
    createdAt: new Date().toISOString(),
  };
}

export function applyDepartmentFormUpdate(
  existing: DepartmentAnalyticsRecord,
  form: DepartmentFormInput,
): DepartmentAnalyticsRecord {
  return {
    ...existing,
    name: form.name,
    subDepartment: form.subDepartment,
    subDepartments: form.subDepartments,
    assignedStationIds: form.assignedStationIds ?? [],
    departmentCode: form.departmentCode,
    managerId: form.managerId,
    managerName: form.managerName,
    managerInitials: form.managerInitials,
    status: form.status ?? existing.status,
    headcountSeed: form.headcountSeed ?? existing.headcountSeed,
    description: form.description,
    permissions: form.permissions,
  };
}
