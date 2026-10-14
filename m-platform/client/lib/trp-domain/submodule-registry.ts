/**
 * TRP submodule registry — maps UI routes to legacy pages and Hono API prefixes.
 * Source: docs/loop_engineering_audit/TRP_MODULE_AUDIT.md
 * Post-login landing is Training Planner (`/trp/planner`); nav order stays Master-first.
 */
export const TRP_SUBMODULES = [
  {
    id: 'master',
    label: 'Master',
    shortLabel: 'Master',
    route: '/trp/master',
    legacyPage: 'TRN_Master.aspx',
    apiPrefix: '/api/trp/master',
    description: 'Register trainings; department/designation mapping; alarm days.',
  },
  {
    id: 'planner',
    label: 'Training Planner',
    shortLabel: 'Training Planner',
    route: '/trp/planner',
    legacyPage: 'TRN_Planner.aspx',
    apiPrefix: '/api/trp/planner',
    description: 'Plans, manual enrollment, attendance upload, due/expired views.',
  },
  {
    id: 'fine-tuning',
    label: 'Fine tunning',
    shortLabel: 'Fine tunning',
    route: '/trp/fine-tuning',
    legacyPage: 'TRN_Fine_Tunning.aspx',
    apiPrefix: '/api/trp/fine-tuning',
    description: 'Per-employee training assignment tuning.',
  },
  {
    id: 'report',
    label: 'Report',
    shortLabel: 'Report',
    route: '/trp/report',
    legacyPage: 'TRN_Report_Dashboard.aspx',
    apiPrefix: '/api/trp/report',
    description: 'Report hub — 6 child reports.',
  },
  {
    id: 'updation',
    label: 'Training Updation',
    shortLabel: 'Updation',
    route: '/trp/updation',
    legacyPage: 'TRN_Updation.aspx',
    apiPrefix: '/api/trp/updation',
    description: 'Update attendance, training status (Pending/Done/Not Required) per employee.',
  },
] as const;

export type TrpSubmoduleId = (typeof TRP_SUBMODULES)[number]['id'];

/** Data dependencies between submodules (for D1 FKs and UI cascades). */
export const TRP_CONNECTIVITY = {
  trainingMaster: {
    feeds: ['fine-tuning', 'planner', 'updation', 'duty-manager', 'report'],
    fields: ['trainingCode', 'description', 'mode', 'applicableFor', 'departments', 'designations', 'year', 'alarmDays'],
  },
  masterSetting: {
    feeds: ['trainer-calendar', 'planner'],
    fields: ['trainerId', 'trainerName', 'location', 'trainerType', 'trainingMappings', 'attachments'],
  },
  planner: {
    feeds: ['updation', 'duty-manager'],
    fields: ['planId', 'trainingCode', 'dateFrom', 'dateTill', 'sessionType', 'enrollments', 'attendanceFiles'],
  },
  updation: {
    feeds: ['report'],
    fields: ['attendanceStatus', 'completionDate', 'employeeCode'],
  },
  material: {
    feeds: [],
    fields: ['materialTitle', 'fileRef', 'trainingCode'],
  },
} as const;
