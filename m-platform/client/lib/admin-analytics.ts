import { loadDepartmentAnalytics, type DepartmentAnalyticsRecord } from '@/lib/departmentAnalyticsMock';
import { fetchPanelUsers, type PanelUserListItem, type PanelUserPermissions } from '@/lib/api';
import { loadStationAnalytics, type StationRecord, type StationRegion } from '@/lib/stationAnalyticsMock';
import { getPermissionTabPageLabels, PERMISSION_TAB_ORDER } from '@/lib/permission-tab-config';
import type { AdminSupportTicketListItem } from '@/lib/support-tickets-api';
import {
  fetchFrisHealthFull,
  type FrisHealthFullSnapshot,
  type FrisHealthSnapshot,
} from '@/lib/system-health-api';
import type { AdminActivityLog, AdminInviteWorkspaceMetric } from '@/lib/user-registration-api';

export type RecentActivityEntry = {
  id: string;
  title: string;
  subtitle: string;
  timestamp: string;
  href: string;
};

export type RecentActivityFeed = {
  employees: RecentActivityEntry[];
  departments: RecentActivityEntry[];
  stations: RecentActivityEntry[];
};

export type AccessControlSnapshot = {
  totalEmployees: number;
  restrictedAccess: number;
  inactiveAccounts: number;
};

export type DowntimeSnapshot = {
  offlineStations: number;
  maintenanceStations: number;
  delayedStations: number;
  totalStations: number;
  /** Stations offline or in maintenance — operational downtime. */
  downtimeStations: number;
};

export type OnboardingSnapshot = {
  queueTotal: number;
  pendingApprovals: number;
  invitesOutstanding: number;
  activeUsers: number;
};

export type PasswordChangesSnapshot = {
  thisWeek: number;
};

export type TrainingProgramSummary = {
  total: number;
  recurring: number;
};

export type AdminAnalyticsSnapshot = {
  stations: StationRecord[];
  departments: DepartmentAnalyticsRecord[];
  users: PanelUserListItem[];
  userCount: number;
  employeeCount: number;
  employeesJoinedThisMonth: number;
  trainingPrograms: TrainingProgramSummary;
  openTickets: number;
  closedTickets: number;
  recentTickets: AdminSupportTicketListItem[];
  recentActivity: RecentActivityFeed;
  health: FrisHealthSnapshot;
  healthFull: FrisHealthFullSnapshot | null;
  accessControl: AccessControlSnapshot;
  downtime: DowntimeSnapshot;
  onboarding: OnboardingSnapshot;
  passwordChanges: PasswordChangesSnapshot;
  registrationActivity: AdminActivityLog[];
  openTicketList: AdminSupportTicketListItem[];
  closedTicketList: AdminSupportTicketListItem[];
};

function parseTimestampMs(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function timestampFromEntityId(id: string): number {
  const dept = id.match(/^dept-(\d+)$/);
  if (dept) return Number(dept[1]);
  const station = id.match(/^st_(\d+)_/);
  if (station) return Number(station[1]);
  return 0;
}

function resolveDepartmentTimestamp(department: DepartmentAnalyticsRecord): number {
  return (
    parseTimestampMs(department.createdAt) ||
    timestampFromEntityId(department.id) ||
    0
  );
}

function resolveStationTimestamp(station: StationRecord): number {
  return parseTimestampMs(station.updatedAt) || timestampFromEntityId(station.id) || 0;
}

function resolveEmployeeTimestamp(user: PanelUserListItem): number {
  return parseTimestampMs(user.createdAt) || parseTimestampMs(user.joiningDate) || 0;
}

export function buildRecentActivityFeed(
  stations: StationRecord[],
  departments: DepartmentAnalyticsRecord[],
  users: PanelUserListItem[],
  limit = 1,
): RecentActivityFeed {
  const employees = [...users]
    .filter((user) => user.accountKind !== 'admin')
    .map((user) => ({
      id: user.id,
      title: user.name?.trim() || user.userid || 'New employee',
      subtitle: [user.designation, user.department].filter(Boolean).join(' · ') || 'Employee',
      timestamp: resolveEmployeeTimestamp(user),
      href: `/admin/user/edit/${encodeURIComponent(user.id)}`,
    }))
    .filter((entry) => entry.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString(),
    }));

  const departmentRows = [...departments]
    .map((department) => ({
      id: department.id,
      title: department.name,
      subtitle: department.subDepartment
        ? `${department.subDepartment} · ${department.departmentCode}`
        : department.departmentCode,
      timestamp: resolveDepartmentTimestamp(department),
      href: '/admin/departments',
    }))
    .filter((entry) => entry.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString(),
    }));

  const stationRows = [...stations]
    .map((station) => ({
      id: station.id,
      title: station.name,
      subtitle: `${station.code} · ${station.city}`,
      timestamp: resolveStationTimestamp(station),
      href: '/admin/stations',
    }))
    .filter((entry) => entry.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString(),
    }));

  return {
    employees,
    departments: departmentRows,
    stations: stationRows,
  };
}

export function formatRecentActivityWhen(iso: string): string {
  const ms = parseTimestampMs(iso);
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type RegionStat = {
  region: StationRegion;
  count: number;
  staff: number;
  avgEfficiency: number;
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function aggregateWeeklyOps(stations: StationRecord[]): number[] {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const station of stations) {
    station.weeklyPerf.forEach((value, index) => {
      totals[index] = (totals[index] ?? 0) + value;
    });
  }
  if (stations.length === 0) return [62, 68, 71, 74, 76, 79, 82];
  return totals.map((v) => Math.round(v / stations.length));
}

export function aggregateRegionStats(stations: StationRecord[]): RegionStat[] {
  const map = new Map<StationRegion, { count: number; staff: number; effSum: number }>();
  for (const station of stations) {
    const hit = map.get(station.region) ?? { count: 0, staff: 0, effSum: 0 };
    hit.count += 1;
    hit.staff += station.activeStaff;
    hit.effSum += station.efficiencyPct;
    map.set(station.region, hit);
  }
  return Array.from(map.entries())
    .map(([region, data]) => ({
      region,
      count: data.count,
      staff: data.staff,
      avgEfficiency: Math.round(data.effSum / data.count),
    }))
    .sort((a, b) => b.count - a.count);
}

export function stationStatusBreakdown(stations: StationRecord[]) {
  const counts = { Active: 0, Maintenance: 0, Delayed: 0, Offline: 0 };
  for (const s of stations) {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
  }
  return [
    { key: 'Active', label: 'Active', count: counts.Active, color: '#10b981' },
    { key: 'Delayed', label: 'Delayed', count: counts.Delayed, color: '#f59e0b' },
    { key: 'Maintenance', label: 'Maintenance', count: counts.Maintenance, color: '#8b5cf6' },
    { key: 'Offline', label: 'Offline', count: counts.Offline, color: '#f43f5e' },
  ];
}

export function topStationsByOps(stations: StationRecord[], limit = 5) {
  return [...stations]
    .sort((a, b) => b.dailyOps - a.dailyOps || b.efficiencyPct - a.efficiencyPct)
    .slice(0, limit);
}

export function topDepartmentsByPerformance(departments: DepartmentAnalyticsRecord[], limit = 6) {
  return [...departments]
    .sort((a, b) => b.performancePct - a.performancePct)
    .slice(0, limit);
}

const TOTAL_PERMISSION_PAGES = PERMISSION_TAB_ORDER.reduce(
  (sum, tab) => sum + getPermissionTabPageLabels(tab).length,
  0,
);

function countEnabledPermissionPages(perms?: PanelUserPermissions): number {
  if (!perms) return 0;
  return Object.values(perms.accessSubPages ?? {}).reduce(
    (sum, pages) => sum + (pages?.length ?? 0),
    0,
  );
}

function resolveUserPermissions(user: PanelUserListItem): PanelUserPermissions | undefined {
  if (user.permissions) return user.permissions;
  const stationIds = user.assignedStationIds ?? [];
  if (stationIds.length === 0) return undefined;
  const firstStationId = stationIds[0];
  return firstStationId ? user.stationPermissions?.[firstStationId] : undefined;
}

function isRestrictedAccessUser(user: PanelUserListItem): boolean {
  const enabled = countEnabledPermissionPages(resolveUserPermissions(user));
  return enabled > 0 && enabled < TOTAL_PERMISSION_PAGES;
}

function isInactiveAccount(user: PanelUserListItem): boolean {
  return user.status.trim().toLowerCase() !== 'active';
}

export function computeAccessControlSnapshot(users: PanelUserListItem[]): AccessControlSnapshot {
  const employees = users.filter((user) => user.accountKind !== 'admin');
  return {
    totalEmployees: employees.length,
    restrictedAccess: employees.filter(isRestrictedAccessUser).length,
    inactiveAccounts: employees.filter(isInactiveAccount).length,
  };
}

export function computeDowntimeSnapshot(stations: StationRecord[]): DowntimeSnapshot {
  const offlineStations = stations.filter((s) => s.status === 'Offline').length;
  const maintenanceStations = stations.filter((s) => s.status === 'Maintenance').length;
  const delayedStations = stations.filter((s) => s.status === 'Delayed').length;
  const downtimeStations = offlineStations + maintenanceStations;

  return {
    offlineStations,
    maintenanceStations,
    delayedStations,
    totalStations: stations.length,
    downtimeStations,
  };
}

export function computeOnboardingSnapshot(
  metrics: AdminInviteWorkspaceMetric | null,
): OnboardingSnapshot {
  const pendingApprovals = metrics?.pendingApprovals ?? 0;
  const invitesOutstanding = metrics?.invitesOutstanding ?? 0;
  return {
    queueTotal: pendingApprovals + invitesOutstanding,
    pendingApprovals,
    invitesOutstanding,
    activeUsers: metrics?.activeUsers ?? 0,
  };
}

export function computeSnapshotMetrics(snapshot: AdminAnalyticsSnapshot) {
  const { stations, departments, userCount, openTickets, closedTickets } = snapshot;
  const totalStaff = stations.reduce((sum, s) => sum + s.activeStaff, 0);
  const avgEfficiency =
    stations.length > 0
      ? Math.round(stations.reduce((sum, s) => sum + s.efficiencyPct, 0) / stations.length)
      : 0;
  const totalDailyOps = stations.reduce((sum, s) => sum + s.dailyOps, 0);
  const activeDepartments = departments.filter((d) => d.status === 'Active').length;
  const avgDeptPerformance =
    departments.length > 0
      ? Math.round(departments.reduce((sum, d) => sum + d.performancePct, 0) / departments.length)
      : 0;

  return {
    stationCount: stations.length,
    departmentCount: departments.length,
    activeDepartments,
    userCount,
    openTickets,
    closedTickets,
    totalStaff,
    avgEfficiency,
    totalDailyOps,
    avgDeptPerformance,
    weeklyOps: aggregateWeeklyOps(stations),
    regions: aggregateRegionStats(stations),
    statusBreakdown: stationStatusBreakdown(stations),
    topStations: topStationsByOps(stations),
    topDepartments: topDepartmentsByPerformance(departments),
  };
}

export { DAY_LABELS };

export async function loadAdminAnalyticsSnapshot(): Promise<AdminAnalyticsSnapshot> {
  const [
    departmentsResult,
    stationsResult,
    usersResult,
    ticketsResult,
    healthResult,
    onboardingResult,
    trainingResult,
  ] = await Promise.allSettled([
    (async () => {
      const { fetchAdminDepartments } = await import('@/lib/admin-departments-api');
      return fetchAdminDepartments();
    })(),
    (async () => {
      const { fetchAdminStations } = await import('@/lib/admin-stations-api');
      return fetchAdminStations();
    })(),
    fetchPanelUsers(),
    (async () => {
      const { fetchAdminSupportTickets } = await import('@/lib/support-tickets-api');
      const [open, closed] = await Promise.all([
        fetchAdminSupportTickets(undefined, 'open'),
        fetchAdminSupportTickets(undefined, 'closed'),
      ]);
      return { open, closed };
    })(),
    fetchFrisHealthFull(),
    (async () => {
      const { fetchUserRegistrationWorkspace } = await import('@/lib/user-registration-api');
      return fetchUserRegistrationWorkspace();
    })(),
    (async () => {
      const { fetchTrainingMatrix } = await import('@/lib/training-matrix-api');
      return fetchTrainingMatrix();
    })(),
  ]);

  const departments =
    departmentsResult.status === 'fulfilled'
      ? departmentsResult.value
      : typeof window !== 'undefined'
        ? loadDepartmentAnalytics()
        : [];

  const stations =
    stationsResult.status === 'fulfilled'
      ? stationsResult.value
      : typeof window !== 'undefined'
        ? loadStationAnalytics()
        : [];

  const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
  const userCount = users.length;
  const employees = users.filter((user) => user.accountKind !== 'admin');
  const employeeCount = employees.length;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const employeesJoinedThisMonth = employees.filter((user) => {
    if (!user.createdAt) return false;
    const created = new Date(user.createdAt);
    return !Number.isNaN(created.getTime()) && created >= monthStart;
  }).length;

  const trainingRows = trainingResult.status === 'fulfilled' ? trainingResult.value : [];
  const trainingPrograms: TrainingProgramSummary = {
    total: trainingRows.length,
    recurring: trainingRows.filter((row) => row.frequencyMonths !== null).length,
  };

  let openTickets = 0;
  let closedTickets = 0;
  let openTicketList: AdminSupportTicketListItem[] = [];
  let closedTicketList: AdminSupportTicketListItem[] = [];
  let recentTickets: AdminSupportTicketListItem[] = [];
  if (ticketsResult.status === 'fulfilled') {
    openTickets = ticketsResult.value.open.count;
    closedTickets = ticketsResult.value.closed.count;
    openTicketList = ticketsResult.value.open.tickets;
    closedTicketList = ticketsResult.value.closed.tickets;
    recentTickets = [...openTicketList, ...closedTicketList]
      .sort((a, b) => {
        const ta = new Date(a.raisedAt ?? 0).getTime();
        const tb = new Date(b.raisedAt ?? 0).getTime();
        return tb - ta;
      })
      .slice(0, 6);
  } else {
    openTickets = Math.max(2, Math.round(stations.length * 0.15));
    closedTickets = Math.max(8, Math.round(stations.length * 0.4));
  }

  const healthFull = healthResult.status === 'fulfilled' ? healthResult.value : null;
  const health: FrisHealthSnapshot = healthFull ?? {
    databaseStatus: 'unknown' as const,
    checkedAt: new Date().toISOString(),
  };

  const onboardingWorkspace =
    onboardingResult.status === 'fulfilled' ? onboardingResult.value : null;
  const onboardingMetrics = onboardingWorkspace?.metrics ?? null;

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const passwordChangesThisWeek = (onboardingWorkspace?.activity ?? []).filter((log) => {
    const ts = log.createdAt ? new Date(log.createdAt).getTime() : 0;
    if (!Number.isFinite(ts) || ts < weekAgo) return false;
    const haystack = `${log.action} ${JSON.stringify(log.metadata ?? {})}`.toLowerCase();
    return haystack.includes('password') || haystack.includes('credential');
  }).length;

  return {
    stations,
    departments,
    users,
    userCount,
    employeeCount,
    employeesJoinedThisMonth,
    trainingPrograms,
    openTickets,
    closedTickets,
    recentTickets,
    recentActivity: buildRecentActivityFeed(stations, departments, users),
    health,
    healthFull,
    accessControl: computeAccessControlSnapshot(users),
    downtime: computeDowntimeSnapshot(stations),
    onboarding: computeOnboardingSnapshot(onboardingMetrics),
    passwordChanges: { thisWeek: passwordChangesThisWeek },
    registrationActivity: onboardingWorkspace?.activity ?? [],
    openTicketList,
    closedTicketList,
  };
}
