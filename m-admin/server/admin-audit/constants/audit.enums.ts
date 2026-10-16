export const AUDIT_SEVERITIES = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const AUDIT_RESULTS = ['SUCCESS', 'FAILED', 'WARNING'] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export const AUDIT_EVENT_TYPES = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'VIEW',
  'LOGIN',
  'LOGOUT',
  'EXPORT',
  'IMPORT',
  'ASSIGN_ROLE',
  'PERMISSION_CHANGE',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const AUDIT_MODULES = [
  'Access Control',
  'Authentication',
  'Flight Operations',
  'Station Management',
  'Reports',
  'Notifications',
  'Contracts',
  'Equipment',
  'Dashboard',
  'Registration',
  'System',
] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export const AUDIT_KPI_FILTERS = [
  'total_today',
  'security',
  'user_actions',
  'config_changes',
  'failed',
  'critical',
  'unique_users',
  'stations_impacted',
] as const;
export type AuditKpiFilter = (typeof AUDIT_KPI_FILTERS)[number];
