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
