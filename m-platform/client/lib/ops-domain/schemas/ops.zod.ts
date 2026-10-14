import { z } from 'zod';
import {
  ACTIVITY_ACTION_TYPES,
  GROOMING_DEPARTMENTS,
  GROOMING_SHIFTS,
  GROOMING_STATUSES,
  MAAS_SERVICE_TYPES,
  MAAS_SHIFTS,
} from '../constants';

export const maasCreateSchema = z.object({
  serviceDate: z.string().trim().min(1),
  shift: z.string().trim().default(''),
  serviceType: z.enum(MAAS_SERVICE_TYPES),
  flight: z.string().trim().min(1).max(32),
  pax: z.string().trim().max(128).default('1'),
  pnr: z.string().trim().max(32).default(''),
  seat: z.string().trim().max(16).default(''),
  whiteGlove: z.string().trim().max(64).default(''),
  blueGlove: z.string().trim().max(64).default(''),
});

export const maasUpdateSchema = maasCreateSchema.partial();

export const maasReportQuerySchema = z.object({
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
});

export const groomingCreateSchema = z.object({
  checklistDate: z.string().trim().min(1),
  department: z.string().trim().min(1),
  subDepartment: z.string().trim().default(''),
  shift: z.enum(['Morning', 'Afternoon', 'Evening']),
  staffName: z.string().trim().max(128).default(''),
  groomingStatus: z.enum(GROOMING_STATUSES).default('Pending'),
  remarks: z.string().trim().max(1024).default(''),
});

export const groomingUpdateSchema = groomingCreateSchema.partial();

export const groomingSearchSchema = z.object({
  fromDate: z.string().trim().optional(),
  tillDate: z.string().trim().optional(),
  shift: z.enum(GROOMING_SHIFTS).default('All'),
  department: z.string().trim().default('All'),
  subDepartment: z.string().trim().default('All'),
});

export const groomingTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  department: z.string().trim().default('All'),
  items: z.array(z.string().trim().min(1)).default([]),
});

export const activityLogCreateSchema = z.object({
  userId: z.string().trim().max(64).default(''),
  userName: z.string().trim().max(128).default(''),
  moduleName: z.string().trim().max(64).default(''),
  actionType: z.enum(ACTIVITY_ACTION_TYPES),
  eventDescription: z.string().trim().max(1024).default(''),
  ipAddress: z.string().trim().max(64).default(''),
  status: z.string().trim().max(32).default('OK'),
});

export const activityLogSearchSchema = z.object({
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  moduleName: z.string().trim().optional(),
  actionType: z.string().trim().optional(),
});

export const departmentEnumHint = GROOMING_DEPARTMENTS;
