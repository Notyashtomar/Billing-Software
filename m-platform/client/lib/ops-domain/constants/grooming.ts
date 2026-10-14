/** Department options from audit_data/grooming_checklist_audit.json (ddlDepartment). */
export const GROOMING_DEPARTMENTS = [
  'All',
  'Ramp',
  'Pax',
  'Accounts',
  'Cargo',
  'GSE Operations & Maintenance',
  'PIC',
  'Support',
  'Vigilance',
  'Operations',
  'Pax UH',
  'AOCC',
  'Cabin Cleaning',
  'GSD /ULD Ops',
  'IT',
  'Load',
  'TNGP',
  'MGNT',
  'GSD',
  'MAINTENANCE',
  'Safety',
  'BME',
  'Nonskd',
  'Maas',
  'HR',
  'Marketing',
  'Human Resources',
  'Non Scheduled',
  'Imphal/ Agartala',
  'Administration',
  'Project',
  'NSD',
] as const;

export const GROOMING_SHIFTS = ['All', 'Morning', 'Afternoon', 'Evening'] as const;

export const GROOMING_STATUSES = [
  'Pending',
  'Pass',
  'Fail',
  'Partial',
  'N/A',
] as const;

/** Sub-department options keyed by department (legacy cascade). */
export const GROOMING_SUB_DEPARTMENTS: Record<string, string[]> = {
  All: ['All'],
  Pax: ['All', 'AY', 'KU', '6E', 'SG', 'UK', 'AI', 'QP'],
  'Pax UH': ['All', 'UH-A', 'UH-B'],
  Ramp: ['All', 'Arrival', 'Departure', 'Bay'],
  Cargo: ['All', 'Import', 'Export', 'Transit'],
  AOCC: ['All', 'Ops Desk', 'Coordination'],
  Maas: ['All', 'White Glove', 'Blue Glove'],
  IT: ['All', 'Helpdesk', 'Infra'],
  HR: ['All', 'Recruitment', 'Payroll'],
  'Human Resources': ['All', 'Recruitment', 'Payroll'],
  Safety: ['All', 'Audit', 'Training'],
  Load: ['All', 'Weight', 'Balance'],
  'Cabin Cleaning': ['All', 'Turnaround', 'Deep Clean'],
  'GSD /ULD Ops': ['All', 'Build-up', 'Breakdown'],
  GSD: ['All', 'Yard', 'Workshop'],
  MAINTENANCE: ['All', 'Line', 'Base'],
  'GSE Operations & Maintenance': ['All', 'Ops', 'Maintenance'],
};

export function subDepartmentsFor(department: string): string[] {
  const key = department.trim();
  if (!key || key === 'All') return ['All'];
  return GROOMING_SUB_DEPARTMENTS[key] ?? ['All', 'General'];
}
