export const TRAINING_DEPARTMENTS = [
  'PAX',
  'RAMP',
  'LOAD CONTROL',
  'GSE OPTR',
  'UTILITY HAND',
  'SAFETY OFFICERS',
  'CARGO',
  'GSE Maint. Deptt.',
] as const;

export type TrainingDepartment = (typeof TRAINING_DEPARTMENTS)[number];

export type TrainingRecord = {
  id: string;
  stationIds: string[];
  name: string;
  minPassPercent?: number;
  /** null = one-time training (Once) */
  frequencyMonths: number | null;
  departments: TrainingDepartment[];
  note?: string;
  createdAt?: string;
};

export type TrainingFormInput = {
  stationIds: string[];
  name: string;
  minPassPercent: string;
  frequencyMonths: string;
  frequencyOnce: boolean;
  departments: TrainingDepartment[];
  note: string;
};

/** Map employee sub-departments to training matrix department keys. */
const SUB_DEPT_TO_TRAINING: Record<string, TrainingDepartment> = {
  Passenger: 'PAX',
  'Check-in': 'PAX',
  Ramp: 'RAMP',
  'Load Control': 'LOAD CONTROL',
  'GSE & Equipment': 'GSE OPTR',
  GSD: 'UTILITY HAND',
  NSOP: 'UTILITY HAND',
  Safety: 'SAFETY OFFICERS',
  Quality: 'SAFETY OFFICERS',
  Cargo: 'CARGO',
  Baggage: 'PAX',
};

const DESIGNATION_TO_TRAINING: Record<string, TrainingDepartment> = {
  'Duty Officer - GSE & Equipment Trainer': 'GSE Maint. Deptt.',
};

export function resolveEmployeeTrainingDepartment(input: {
  subDepartment?: string;
  designation?: string;
  department?: string;
}): TrainingDepartment | null {
  const designation = input.designation?.trim();
  if (designation && DESIGNATION_TO_TRAINING[designation]) {
    return DESIGNATION_TO_TRAINING[designation];
  }

  const sub = input.subDepartment?.trim();
  if (sub && SUB_DEPT_TO_TRAINING[sub]) {
    return SUB_DEPT_TO_TRAINING[sub];
  }

  const dept = input.department?.trim().toLowerCase() ?? '';
  if (dept.includes('safety')) return 'SAFETY OFFICERS';
  if (dept.includes('cargo')) return 'CARGO';

  return null;
}

export type TrainingStaffMember = {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  subDepartment?: string;
  designation: string;
  trainingDepartment: TrainingDepartment;
};

export function listStaffForTraining(
  training: TrainingRecord,
  employees: Array<{
    id: string;
    employeeId: string;
    name: string;
    department: string;
    subDepartment?: string;
    designation: string;
  }>,
): TrainingStaffMember[] {
  const applicable = new Set(training.departments);
  const rows: TrainingStaffMember[] = [];

  for (const employee of employees) {
    const mapped = resolveEmployeeTrainingDepartment(employee);
    if (mapped && applicable.has(mapped)) {
      rows.push({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        department: employee.department,
        subDepartment: employee.subDepartment,
        designation: employee.designation,
        trainingDepartment: mapped,
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function countStaffForTraining(
  training: TrainingRecord,
  employees: Array<{ subDepartment?: string; designation?: string; department?: string }>,
): number {
  return listStaffForTraining(
    training,
    employees as Array<{
      id: string;
      employeeId: string;
      name: string;
      department: string;
      subDepartment?: string;
      designation: string;
    }>,
  ).length;
}

export function formatTrainingFrequency(months: number | null): string {
  if (months === null) return 'Once';
  if (months === 1) return '1 month';
  return `${months} months`;
}

export function trainingToForm(training: TrainingRecord): TrainingFormInput {
  return {
    stationIds: [...training.stationIds],
    name: training.name,
    minPassPercent: training.minPassPercent != null ? String(training.minPassPercent) : '',
    frequencyMonths: training.frequencyMonths != null ? String(training.frequencyMonths) : '36',
    frequencyOnce: training.frequencyMonths === null,
    departments: [...training.departments],
    note: training.note ?? '',
  };
}

export const INITIAL_TRAINING_FORM: TrainingFormInput = {
  stationIds: [],
  name: '',
  minPassPercent: '',
  frequencyMonths: '36',
  frequencyOnce: false,
  departments: [],
  note: '',
};
