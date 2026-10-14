/**
 * TRP training codes — extracted from legacy IXC dropdowns (Playwright audit 2026-07-28).
 * Station-specific lists may differ; load from D1 per station in production.
 */
export const TRP_TRAINING_CODES_IXC = [
  'ADP',
  'All-LS',
  'AVSEC-ALL',
  'AVSEC-BASIC',
  'CSQ-AUDTR',
  'CSQ-SMS-L-2/3',
  'CSQ-SMSAWR',
  'DG- ARW',
  'DG-C10',
  'DG-C8',
  'DG-C9',
  'ERP',
  'FS-ALL',
  'GSD-ACFT-MR',
  'GSD-BFL',
  'GSD-EBTDBT',
  'GSD-EMEVC',
  'GSD-GPU',
  'GSD-HSET',
  'GSD-HSET-OJT',
  'GSD-PCH',
  'GSD-PSL',
  'GSD-PWU',
  'GSD-TSU',
  'GSE-DI',
  'GSE-PMSAWR',
  'HF-ALL',
  'IN-All',
  'P-BP',
  'P-CLC-IX',
  'P-CoC',
  'P-DCS-UK-ALT-CM',
  'P-GR',
  'P-IROPS',
  'P-MHB',
  'P-MHB-IX',
  'P-NAV-IX-GO-NOW',
  'P-PR-UK',
  'P-RES-IX',
  'P-RES-UK',
  'P-SS',
  'PRM-ALL',
  'R-AHL',
  'R-BLCA',
  'R-CC',
  'R-LC-QP-LS',
  'R-LC-UK-LS',
  'R-PDOOR-UK',
  'R-UK-LO',
  'R-WW',
  'RS-ALL',
] as const;

export type TrpTrainingCode = (typeof TRP_TRAINING_CODES_IXC)[number];

export const TRP_TRAINING_MODES = [
  'Once',
  'Monthly',
  'Quartly',
  'Half Yearly',
  'Yearly',
  '2 Years',
  '3 Years',
  '4 Years',
  '5 Years',
] as const;

export const TRP_APPLICABLE_FOR = ['New Joining', 'Normal'] as const;

export const TRP_PLANNER_TRAINING_TYPES = ['Training', 'Session'] as const;

export const TRP_TRAINER_TYPES = ['Internal', 'External'] as const;

export const TRP_DEPARTMENTS = [
  'All',
  'Accounts',
  'GSE Maintenance',
  'HR',
  'HR and Finance',
  'Passenger Services',
  'Ramp',
  'Security',
  'Support',
  'Training',
  'Vigilance',
] as const;

/** Common IXC sub-department labels from legacy Training Master (picker / map). */
export const TRP_SUB_DEPARTMENTS = [
  'All',
  'Accounts',
  'CSQ',
  'Ground',
  'GSD',
  'GSE Maintenance',
  'HR',
  'Operations',
  'Passenger Services',
  'Ramp',
  'Safety & Quality',
  'Security',
  'Support',
  'Training',
  'Vigilance',
] as const;

export const TRP_DESIGNATIONS = [
  'All',
  'Account Assistant',
  'ADM',
  'Admin, Assistant',
  'Agent',
  'Airport Manager',
  'Cleaner',
  'CSH',
  'CSO',
  'Duty Manager',
  'Helper UH',
  'HOD',
  'HR Assistant',
  'HR Executive',
  'LC Officer',
  'Manager',
  'Operator I',
  'Operator II',
  'Operator III',
  'Safety Officer',
  'SME',
  'Sr. Technician',
  'Store & Admin',
  'Supervisor',
  'Team Leader',
  'Technician',
  'Trainee',
  'Trainer',
  'UH',
  'Vigilance Officer',
] as const;

export const TRP_REPORT_TILES = [
  { id: 'master-report', label: 'Training Master Report', legacyPath: 'TRN_Report_Master.aspx' },
  { id: 'training-details', label: 'Training Details for Expiry', legacyPath: 'TRN_Report_TrainingDetails.aspx' },
  { id: 'employee-details', label: 'Employee Training Details', legacyPath: 'TRN_Report_EmployeeDetails.aspx' },
  { id: 'analysis', label: 'Training Analysis', legacyPath: 'TRN_Report_Analysis.aspx' },
  { id: 'timeline', label: 'Training Timeline', legacyPath: 'TRN_Report_Timeline.aspx' },
  { id: 'latest-training', label: 'Latest Training Of Employee', legacyPath: 'TRN_Report_LatestTraining.aspx' },
] as const;
