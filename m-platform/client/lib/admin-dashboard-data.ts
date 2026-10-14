import type { AdminAnalyticsSnapshot } from '@/lib/admin-analytics';
import { computeSnapshotMetrics } from '@/lib/admin-analytics';
import {
  getSystemCheckTilePatches,
  mergeSystemCheckSections,
  type SystemCheckSection,
} from '@/lib/system-check-data';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  ClipboardCheck,
  CloudUpload,
  Database,
  FileText,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
  Truck,
  GraduationCap,
  Key,
  UserPlus,
  Waypoints,
  WifiOff,
} from 'lucide-react';
import type { WorkspaceModule } from '@/lib/admin-workspace/types';
import { tileKeyToWorkspace } from '@/lib/admin-workspace/tile-map';

export type DashboardAccent = 'emerald' | 'teal' | 'amber' | 'red' | 'purple' | 'blue';

export type DashboardKpiItem = {
  key: string;
  value: number | string;
  label: string;
  change: string;
  changeDirection?: 'up' | 'down' | 'neutral';
  accent: DashboardAccent;
  href?: string;
  animate?: boolean;
};

export type DashboardTileBadge = {
  tone: 'teal' | 'emerald' | 'amber' | 'gray' | 'red' | 'purple' | 'blue';
  label: string;
};

export type DashboardInsightCard = {
  key: string;
  title: string;
  subtitle: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  href?: string;
};

export type DashboardAdminTileAction = 'access-control';

export type DashboardAdminTile = {
  key: string;
  title: string;
  sub: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  badges?: DashboardTileBadge[];
  progress?: number;
  progressColor?: DashboardAccent;
  /** Opens inside AdminWorkspaceOverlay — no page navigation. */
  workspace?: WorkspaceModule;
  href?: string;
  action?: DashboardAdminTileAction;
};

export const SYSTEM_CHECK_TILE_KEYS = [
  'health',
  'audit',
  'database',
  'api',
  'incidents',
  'backup',
  'downtime',
] as const;

export type SystemCheckTileKey = (typeof SYSTEM_CHECK_TILE_KEYS)[number];

/** Hidden from System Check UI — remove keys here to show again */
export const SYSTEM_CHECK_HIDDEN_TILE_KEYS: SystemCheckTileKey[] = ['incidents', 'backup'];

export function isSystemCheckTileVisible(key: string): key is SystemCheckTileKey {
  return (
    SYSTEM_CHECK_TILE_KEYS.includes(key as SystemCheckTileKey) &&
    !SYSTEM_CHECK_HIDDEN_TILE_KEYS.includes(key as SystemCheckTileKey)
  );
}

export type { SystemCheckDetailRow, SystemCheckSection, SystemCheckInsight, SystemCheckStatusTone } from '@/lib/system-check-data';

export const HEADCOUNT_TREND = [
  { month: 'Jan', total: 210, present: 180 },
  { month: 'Feb', total: 218, present: 192 },
  { month: 'Mar', total: 224, present: 196 },
  { month: 'Apr', total: 230, present: 200 },
  { month: 'May', total: 248, present: 195 },
  { month: 'Jun', total: 256, present: 198 },
] as const;

export const STAFF_BY_STATION = [
  { station: 'Agra', staff: 65 },
  { station: 'Chd', staff: 65 },
  { station: 'Chennai', staff: 74 },
  { station: 'Cochin', staff: 67 },
  { station: 'CBE', staff: 71 },
  { station: 'Goa', staff: 22 },
  { station: 'Imphal', staff: 74 },
  { station: 'Delhi', staff: 58 },
  { station: 'Juhu', staff: 30 },
  { station: 'BLR', staff: 29 },
  { station: 'AGT', staff: 20 },
  { station: 'Noida', staff: 43 },
] as const;

export const ATTENDANCE_SPLIT = {
  present: 198,
  leave: 28,
  absent: 30,
} as const;

const E = {
  bg50: '#ecfdf5',
  bg100: '#d1fae5',
  bgSoft: '#f0fdfa',
  c800: '#065f46',
  c700: '#047857',
  c600: '#059669',
} as const;

const TILE_ICONS = [
  { iconBg: E.bg50, iconColor: E.c800 },
  { iconBg: E.bg100, iconColor: E.c700 },
  { iconBg: E.bgSoft, iconColor: E.c600 },
] as const;

function tileIcon(index: number) {
  return TILE_ICONS[index % TILE_ICONS.length]!;
}

function countAdmins(users: AdminAnalyticsSnapshot['users']) {
  return users.filter((user) => user.accountKind === 'admin').length;
}

function countManagers(users: AdminAnalyticsSnapshot['users']) {
  return users.filter((user) => {
    const role = `${user.role} ${user.authorizationRole ?? ''} ${user.designation ?? ''}`.toLowerCase();
    return role.includes('manager') || role.includes('supervisor');
  }).length;
}

export function buildDashboardInsightCards(snapshot: AdminAnalyticsSnapshot): DashboardInsightCard[] {
  const { trainingPrograms, onboarding, passwordChanges } = snapshot;

  return [
    {
      key: 'password',
      title: 'Password changed',
      subtitle: 'Credential updates this week',
      value: passwordChanges.thisWeek,
      detail: 'Across all users',
      icon: Key,
      href: '/admin/users',
    },
    {
      key: 'training',
      title: 'Training',
      subtitle: 'Programs in training matrix',
      value: trainingPrograms.total,
      detail: `${trainingPrograms.recurring} recurring`,
      icon: GraduationCap,
      href: '/admin/training',
    },
    {
      key: 'onboarding',
      title: 'Onboarding',
      subtitle: 'Pending invites and approvals',
      value: onboarding.queueTotal,
      detail: `${onboarding.pendingApprovals} approvals`,
      icon: UserPlus,
      href: '/admin/onboarding',
    },
  ];
}

export function buildCoreOperationsKpis(snapshot: AdminAnalyticsSnapshot): DashboardKpiItem[] {
  const metrics = computeSnapshotMetrics(snapshot);
  const activeStations = metrics.statusBreakdown.find((s) => s.key === 'Active')?.count ?? 0;

  return [
    {
      key: 'stations',
      value: metrics.stationCount,
      label: 'Active stations',
      change: `↑ ${activeStations} operational`,
      changeDirection: 'up',
      accent: 'emerald',
      href: '/admin/stations',
      animate: true,
    },
    {
      key: 'departments',
      value: metrics.departmentCount,
      label: 'Departments',
      change: `${metrics.activeDepartments} active`,
      changeDirection: 'neutral',
      accent: 'emerald',
      href: '/admin/departments',
      animate: true,
    },
    {
      key: 'employees',
      value: snapshot.employeeCount,
      label: 'Total employees',
      change:
        snapshot.employeesJoinedThisMonth > 0
          ? `↑ +${snapshot.employeesJoinedThisMonth} this month`
          : 'No new joins this month',
      changeDirection: 'up',
      accent: 'emerald',
      href: '/admin/users',
      animate: true,
    },
    {
      key: 'staff',
      value: metrics.totalStaff,
      label: 'Station staff',
      change: `${metrics.totalDailyOps.toLocaleString()} daily ops`,
      changeDirection: 'neutral',
      accent: 'teal',
      href: '/admin/stations',
      animate: true,
    },
  ];
}

export function buildAdminTiles(snapshot: AdminAnalyticsSnapshot): DashboardAdminTile[] {
  const metrics = computeSnapshotMetrics(snapshot);
  const adminCount = countAdmins(snapshot.users);
  const managerCount = countManagers(snapshot.users);
  const systemCheckPatches = getSystemCheckTilePatches(snapshot);
  const downtimeActive = snapshot.downtime.downtimeStations;

  const tiles = [
    {
      key: 'access',
      title: 'Access control',
      sub: 'Roles, permissions, sessions',
      value: String(Math.max(adminCount + managerCount, 4)),
      unit: 'roles',
      icon: Lock,
      ...tileIcon(0),
      badges: [
        { tone: 'emerald', label: `${adminCount || 2} admins` },
        { tone: 'teal', label: `${managerCount || 3} managers` },
      ],
    },
    {
      key: 'health',
      title: 'System health',
      sub: systemCheckPatches.health.sub ?? 'Runtime · Memory · API liveness',
      value: systemCheckPatches.health.value,
      unit: systemCheckPatches.health.unit,
      icon: Activity,
      ...tileIcon(1),
      progress: systemCheckPatches.health.progress,
      progressColor: systemCheckPatches.health.progressColor,
      badges: systemCheckPatches.health.badges,
    },
    {
      key: 'audit',
      title: 'Audit log',
      sub: systemCheckPatches.audit.sub ?? 'Registration & onboarding activity',
      value: systemCheckPatches.audit.value,
      unit: systemCheckPatches.audit.unit,
      icon: ShieldCheck,
      ...tileIcon(2),
      badges: systemCheckPatches.audit.badges,
    },
    {
      key: 'database',
      title: 'Database',
      sub: systemCheckPatches.database.sub ?? 'MongoDB readiness · Ping',
      value: systemCheckPatches.database.value,
      icon: Database,
      ...tileIcon(2),
      progress: systemCheckPatches.database.progress,
      progressColor: systemCheckPatches.database.progressColor,
      badges: systemCheckPatches.database.badges,
    },
    {
      key: 'api',
      title: 'API gateway',
      sub: systemCheckPatches.api.sub ?? 'Health probes · Throttling policy',
      value: systemCheckPatches.api.value,
      unit: systemCheckPatches.api.unit,
      icon: Waypoints,
      ...tileIcon(1),
      badges: systemCheckPatches.api.badges,
    },
    {
      key: 'notifications',
      title: 'Notifications',
      sub: 'Alerts, broadcasts, delivery',
      value: String(metrics.openTickets || 7),
      unit: 'unread',
      icon: Bell,
      href: '/admin/notifications',
      ...tileIcon(0),
      badges: [
        { tone: 'amber', label: '3 urgent' },
        { tone: 'gray', label: '4 info' },
      ],
    },
    {
      key: 'email',
      title: 'Email / SMS service',
      sub: 'SMTP · OTP · Bulk notify',
      value: '1,240',
      unit: 'sent today',
      icon: Mail,
      ...tileIcon(0),
      badges: [{ tone: 'emerald', label: '97.2% delivered' }],
    },
    {
      key: 'reports',
      title: 'Reports & analytics',
      sub: 'Scheduled reports, exports',
      value: '12',
      unit: 'scheduled',
      icon: BarChart3,
      ...tileIcon(1),
      badges: [{ tone: 'teal', label: 'Next: 18:00' }],
    },
    {
      key: 'incidents',
      title: 'Incident tracker',
      sub: 'Safety events · Near misses',
      value: systemCheckPatches.incidents.value,
      unit: systemCheckPatches.incidents.unit,
      icon: AlertTriangle,
      ...tileIcon(2),
      badges: systemCheckPatches.incidents.badges,
    },
    {
      key: 'gse',
      title: 'GSE / Equipment',
      sub: 'Ground support equipment',
      value: '86',
      unit: 'units',
      icon: Truck,
      ...tileIcon(1),
      badges: [
        { tone: 'emerald', label: '72 active' },
        { tone: 'teal', label: '14 servicing' },
      ],
    },
    {
      key: 'compliance',
      title: 'Compliance',
      sub: 'Checks · Audits · Entries',
      value: 'Live',
      unit: 'network',
      icon: ClipboardCheck,
      ...tileIcon(1),
    },
    {
      key: 'performance',
      title: 'Performance KPIs',
      sub: 'Turnaround · OTP · CSAT',
      value: '4.6',
      unit: 'avg CSAT',
      icon: TrendingUp,
      ...tileIcon(2),
      badges: [{ tone: 'emerald', label: '↑ 0.2 vs last month' }],
    },
    {
      key: 'contracts',
      title: 'Contract management',
      sub: 'SGHAs · Airlines · Renewals',
      value: '18',
      unit: 'active SGHAs',
      icon: FileText,
      ...tileIcon(0),
      badges: [{ tone: 'teal', label: '2 renewing' }],
    },
    {
      key: 'backup',
      title: 'Backup & recovery',
      sub: 'Automated backups · Restore',
      value: systemCheckPatches.backup.value,
      unit: systemCheckPatches.backup.unit,
      icon: CloudUpload,
      ...tileIcon(1),
      badges: systemCheckPatches.backup.badges,
    },
    {
      key: 'downtime',
      title: 'Downtime tracker',
      sub: 'FRIS outages · API & page failures',
      value: systemCheckPatches.downtime.value || String(downtimeActive),
      unit: systemCheckPatches.downtime.unit,
      icon: WifiOff,
      ...tileIcon(0),
      badges: systemCheckPatches.downtime.badges,
    },
  ] as DashboardAdminTile[];

  return tiles.map((tile) => ({
    ...tile,
    workspace: tileKeyToWorkspace(tile.key) ?? tile.workspace,
  }));
}

export function buildSystemCheckSections(snapshot: AdminAnalyticsSnapshot): SystemCheckSection[] {
  const tiles = buildAdminTiles(snapshot).filter((tile): tile is DashboardAdminTile & { key: SystemCheckTileKey } =>
    isSystemCheckTileVisible(tile.key),
  );
  return mergeSystemCheckSections(snapshot, tiles);
}

export function buildHeadcountTrend(
  snapshot: AdminAnalyticsSnapshot,
): Array<{ month: string; total: number; present: number }> {
  const trend: Array<{ month: string; total: number; present: number }> = HEADCOUNT_TREND.map(
    (row) => ({
      month: row.month,
      total: row.total,
      present: row.present,
    }),
  );
  const last = trend[trend.length - 1];
  if (last) {
    last.total = snapshot.employeeCount || last.total;
    last.present = ATTENDANCE_SPLIT.present;
  }
  return trend;
}

export function buildStaffByStation(snapshot: AdminAnalyticsSnapshot) {
  if (snapshot.stations.length === 0) {
    return STAFF_BY_STATION.map((row) => ({ ...row }));
  }
  return [...snapshot.stations]
    .sort((a, b) => b.activeStaff - a.activeStaff)
    .slice(0, 12)
    .map((station) => ({
      station: station.city || station.code,
      staff: station.activeStaff,
    }));
}
