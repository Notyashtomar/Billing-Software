/** Canonical training titles aligned with the training matrix. */
export const TRAINING_TITLE_OPTIONS = [
  'Induction, Code of Conduct, Grooming',
  'SMS Awareness (L-I)',
  'SMS Basic / Advance (L-II/L-III)',
  'Internal Auditor',
  'AVSEC',
  'Human Factors',
  'Ramp Safety / Fire Safety Awareness',
  'Airside Driver training',
  'Basic Passenger Handling',
  'Ramp Handling (Aircraft Handling & Loading / Unloading & Supervision Training)',
  'Basic Load Control',
  'Basic Cargo & Warehouse Handling',
  'Equipment (GSE) Operation / Emergency Procedures',
  'Aircraft Marshalling',
  'Wing Walking',
  'Dangerous Goods Regulations CBTA',
  'Local Emergency Response Procedure',
  'Leadership Training — Supervision & Oversight',
  'PRM',
  'Ground Support Equipment — Preventive Maintenance',
  'Basic cargo handling',
  'Ground to Flight Deck Headset Communication & Engine Start',
] as const;

export type TrainingTitleOption = (typeof TRAINING_TITLE_OPTIONS)[number];

/** Form dropdown: canonical titles plus the current value when editing legacy rows. */
export function buildTrainingTitleFormOptions(currentTitle?: string): string[] {
  const options = [...TRAINING_TITLE_OPTIONS];
  const known = new Set<string>(TRAINING_TITLE_OPTIONS);
  const current = currentTitle?.trim();
  if (current && !known.has(current)) {
    return [current, ...options];
  }
  return options;
}
