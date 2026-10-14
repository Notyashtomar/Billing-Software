/** Canonical designation list for admin user / employee forms and filters. */
export const DESIGNATION_OPTIONS = [
  'General Manager',
  'Manager',
  'Assistant Manager-HR and Admin',
  'Duty Officer - GSE & Equipment Trainer',
  'Team Leader',
  'South Head - Safety & Quality',
  'Operator - III',
  'Manager-NSOP',
  'Supervisor',
  'Customer Service Agent',
  'Sr. Customer Service Agent',
  'Duty Officer',
  'Sr. AEP Coordinator',
  'Utility Hand',
  'Operator - I',
  'Operator - II',
  'Assistant Manager',
  'Duty Manager',
  'Vigilance Officer',
  'Store Assistant',
  'Sr. Technician',
  'Customer Service Host',
  'Assistant Technician',
  'Technician',
  'AEP Coordinator',
  'Deputy Manager',
  'Head of Operations',
  'Chief Security Officer',
  'Supervisor- LC',
  'Head set Operator',
  'Team Leader - LC',
  'Safety Officer',
  'Store Executive',
  'Team Leader - CC',
  'Office Boy',
  'Time office Assistant',
  'Admin Assistant',
  'Junior Accountant',
  'Turn Around Coordinator',
  'Operation Executive',
  'Headset Operator',
  'Time Office Assistant',
  'Head Set Operator',
  'Team Leader- Ramp',
  'Cargo Coordinator',
  'Team Leader-Operator & Equipment Trainer',
  'Duty Officer - Cargo',
] as const;

export type DesignationOption = (typeof DESIGNATION_OPTIONS)[number];

/** Filter dropdown: canonical list plus any values already stored on employees. */
export function buildDesignationFilterOptions(existingFromEmployees: string[]) {
  const known = new Set<string>(DESIGNATION_OPTIONS);
  const extra = existingFromEmployees.filter(
    (value) => value && value !== '—' && !known.has(value),
  );
  return ['All Designations', ...DESIGNATION_OPTIONS, ...extra];
}

/** Form dropdown: canonical designations plus the current value when editing legacy rows. */
export function buildDesignationFormOptions(currentDesignation?: string): string[] {
  const options = [...DESIGNATION_OPTIONS];
  const known = new Set<string>(DESIGNATION_OPTIONS);
  const current = currentDesignation?.trim();
  if (current && !known.has(current)) {
    return [current, ...options];
  }
  return options;
}
