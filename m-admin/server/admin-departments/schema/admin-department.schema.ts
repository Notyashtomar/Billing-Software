import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminDepartmentDocument = AdminDepartment & Document;

@Schema({ _id: false })
export class DepartmentNavigationPermissions {
  @Prop({ type: [String], default: [] })
  accessTabs: string[];

  @Prop({ type: Object, default: {} })
  accessSubPages: Record<string, string[]>;
}

export const DepartmentNavigationPermissionsSchema =
  SchemaFactory.createForClass(DepartmentNavigationPermissions);

@Schema({ timestamps: true, collection: 'admin-departments' })
export class AdminDepartment {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  subDepartment?: string;

  @Prop({ type: [String], default: [] })
  subDepartments?: string[];

  /** Admin-station document ids where this department applies. */
  @Prop({ type: [String], default: [] })
  assignedStationIds?: string[];

  @Prop({ required: true, trim: true })
  departmentCode: string;

  @Prop({ default: 'Active' })
  status: string;

  @Prop({ default: '' })
  managerId: string;

  @Prop({ default: '' })
  managerName: string;

  @Prop({ default: '' })
  managerInitials: string;

  @Prop({ type: Number, default: 0 })
  headcountSeed?: number;

  @Prop({ type: Number, default: 88 })
  attendancePct: number;

  @Prop({ type: Number, default: 85 })
  performancePct: number;

  @Prop({ type: Number, default: 78 })
  taskCompletionPct: number;

  @Prop({ type: [Number], default: [70, 72, 74, 76, 78, 80, 82] })
  weeklyPerformance: number[];

  @Prop({ default: '' })
  insight: string;

  @Prop({ type: Number, default: 400_000 })
  budgetUsd: number;

  @Prop({ default: 'emerald' })
  accent: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ type: DepartmentNavigationPermissionsSchema, default: {} })
  permissions?: DepartmentNavigationPermissions;
}

export const AdminDepartmentSchema =
  SchemaFactory.createForClass(AdminDepartment);
