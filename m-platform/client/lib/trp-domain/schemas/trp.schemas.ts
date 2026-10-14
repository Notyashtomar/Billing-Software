import type {
  TRP_APPLICABLE_FOR,
  TRP_DEPARTMENTS,
  TRP_DESIGNATIONS,
  TRP_TRAINING_MODES,
} from '../constants';

export type TrpApplicableFor = (typeof TRP_APPLICABLE_FOR)[number];
export type TrpTrainingMode = (typeof TRP_TRAINING_MODES)[number];
export type TrpDepartment = (typeof TRP_DEPARTMENTS)[number];
export type TrpDesignation = (typeof TRP_DESIGNATIONS)[number];

/** Training Master registration — TRN_Master.aspx */
export type TrpTrainingMaster = {
  stationCode: string;
  trainingCode: string;
  description?: string;
  applicableFor: TrpApplicableFor;
  mode: TrpTrainingMode;
  year: number;
  alarmDays: number;
  departments: TrpDepartment[];
  subDepartments: string[];
  designations: TrpDesignation[];
};

/** Fine tuning — TRN_Fine_Tunning.aspx */
export type TrpFineTuning = {
  stationCode: string;
  trainingCode: string;
  employeeCode: string;
  department?: string;
  subDepartment?: string;
  designation?: string;
};

/** Planner filters — TRN_Planner.aspx */
export type TrpPlannerFilter = {
  stationCode: string;
  trainingType: 'All' | 'Training' | 'Session';
  applicableFor: 'All' | 'Normal' | 'New Joining';
  trainingCode: string;
  dateFrom?: string;
  dateTill?: string;
};

/** Master Setting trainer — TRN_Basic_Master.aspx */
export type TrpTrainer = {
  stationCode: string;
  trainerId: string;
  trainerName: string;
  location?: string;
  trainerType: 'Internal' | 'External';
};

export type TrpMaterialSearch = {
  stationCode: string;
  query?: string;
};
