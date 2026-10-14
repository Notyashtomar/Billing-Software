export {
  GROOMING_DEPARTMENTS,
  GROOMING_SHIFTS,
  GROOMING_STATUSES,
  GROOMING_SUB_DEPARTMENTS,
  subDepartmentsFor,
} from './grooming';


export const MAAS_SERVICE_TYPES = ['Single', 'Group'] as const;

export const MAAS_STAFF_TYPES = ['Single', 'Group'] as const;

export const MAAS_STAFF_ROLES = ['BFS', 'UH', 'Both'] as const;

export const MAAS_SHIFTS = [
  '',
  'Day (06:00-18:00)',
  'Night (18:00-06:00)',
] as const;

export const ACTIVITY_ACTION_TYPES = [
  'LOGIN',
  'CREATE',
  'UPDATE',
  'DELETE',
  'SEARCH',
  'EXPORT',
  'VIEW',
] as const;

export const LOG_MODULES = [
  'All',
  'MAAS Services',
  'Grooming Checklist',
  'Log Data',
  'FRIS',
  'ULD',
  'TRP',
  'Auth',
] as const;
