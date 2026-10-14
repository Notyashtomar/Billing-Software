import { z } from 'zod';
import {
  TRP_APPLICABLE_FOR,
  TRP_DEPARTMENTS,
  TRP_DESIGNATIONS,
  TRP_PLANNER_TRAINING_TYPES,
  TRP_TRAINER_TYPES,
  TRP_TRAINING_MODES,
} from '../constants';

export const stationCodeSchema = z.string().trim().min(2).max(8);

export const trainingMasterCreateSchema = z.object({
  trainingCode: z.string().trim().min(1).max(64),
  description: z.string().trim().max(512).optional(),
  applicableFor: z.enum(TRP_APPLICABLE_FOR),
  mode: z.enum(TRP_TRAINING_MODES),
  year: z.number().int().min(2016).max(2035),
  alarmDays: z.number().int().min(0).max(365).default(0),
  departments: z.array(z.enum(TRP_DEPARTMENTS)).min(1),
  subDepartments: z.array(z.string().trim().min(1)).default([]),
  designations: z.array(z.enum(TRP_DESIGNATIONS)).min(1),
});

export const trainingMasterUpdateSchema = trainingMasterCreateSchema.partial();

export const fineTuningSaveSchema = z.object({
  trainingCode: z.string().trim().min(1),
  employeeCode: z.string().trim().min(1).max(32),
  department: z.string().trim().max(128).optional(),
  subDepartment: z.string().trim().max(128).optional(),
  designation: z.string().trim().max(128).optional(),
  notes: z.string().trim().max(1024).optional(),
});

export const plannerFilterSchema = z.object({
  trainingType: z.enum(['All', ...TRP_PLANNER_TRAINING_TYPES]),
  applicableFor: z.enum(['All', 'Normal', 'New Joining']),
  trainingCode: z.string().trim().default('All'),
  dateFrom: z.string().trim().optional(),
  dateTill: z.string().trim().optional(),
});

export const plannerCreateSchema = z.object({
  trainingCode: z.string().trim().min(1),
  sessionType: z.enum(TRP_PLANNER_TRAINING_TYPES),
  applicableFor: z.enum(['Normal', 'New Joining']).optional(),
  dateFrom: z.string().trim().optional(),
  dateTill: z.string().trim().optional(),
  employeeCodes: z.array(z.string().trim().min(1)).default([]),
});

export const updationAttendanceSchema = z.object({
  trainingCode: z.string().trim().min(1),
  employeeCode: z.string().trim().min(1),
  attendanceDate: z.string().trim().min(1),
  status: z.enum(['Present', 'Absent', 'Excused']),
});

export const trainerSaveSchema = z.object({
  trainerId: z.string().trim().min(1).max(32),
  trainerName: z.string().trim().min(1).max(128),
  location: z.string().trim().max(128).optional(),
  trainerType: z.enum(TRP_TRAINER_TYPES),
});

export const trainerMapSchema = z.object({
  trainerId: z.string().trim().min(1),
  trainingCode: z.string().trim().min(1),
  attachmentRef: z.string().trim().max(512).optional(),
});

export const materialCreateSchema = z.object({
  title: z.string().trim().min(1).max(256),
  version: z.string().trim().max(64).optional(),
  trainingCode: z.string().trim().max(64).optional(),
  trainerId: z.string().trim().max(64).optional(),
  revision: z.string().trim().max(64).optional(),
  isActive: z.boolean().default(true),
  fileRef: z.string().trim().max(512).optional(),
});

export const materialSearchSchema = z.object({
  query: z.string().trim().max(256).optional(),
});

export const calendarQuerySchema = z.object({
  trainerType: z.enum(['All', ...TRP_TRAINER_TYPES]).default('All'),
  trainerId: z.string().trim().optional(),
  month: z.string().trim().regex(/^\d{4}-\d{2}$/).optional(),
});

export const dutyManagerQuerySchema = z.object({
  department: z.string().trim().optional(),
  subDepartment: z.string().trim().optional(),
  trainingCode: z.string().trim().optional(),
  employeeCode: z.string().trim().optional(),
});

export const reportQuerySchema = z.object({
  reportId: z.enum([
    'master-report',
    'training-details',
    'employee-details',
    'analysis',
    'timeline',
    'latest-training',
  ]),
  trainingCode: z.string().trim().optional(),
  dateFrom: z.string().trim().optional(),
  dateTill: z.string().trim().optional(),
});

export const locationCreateSchema = z.object({
  name: z.string().trim().min(1).max(256),
  isActive: z.boolean().default(true),
});

export const venueCreateSchema = z.object({
  name: z.string().trim().min(1).max(256),
  isActive: z.boolean().default(true),
});

