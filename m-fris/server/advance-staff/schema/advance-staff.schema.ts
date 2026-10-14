import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import {
  StaffGseAssignment,
  StaffGseAssignmentSchema,
} from './staff-gse-assignment.schema';

export type AdvanceStaffDocument = AdvanceStaff & Document;

/** Advance → Gateway staff master. */
@Schema({ timestamps: true, collection: 'advance-staff' })
export class AdvanceStaff {
  @Prop({ required: true, trim: true, uppercase: true })
  employeeCode: string;

  @Prop({ required: true, trim: true })
  employeeName: string;

  @Prop({ trim: true, default: '' })
  manpower: string;

  @Prop({ trim: true, default: '' })
  manpowerCode: string;

  @Prop({ type: [StaffGseAssignmentSchema], default: [] })
  gseAssigned: StaffGseAssignment[];

  /** Legacy fields kept for backward compatibility with older rows. */
  @Prop({ trim: true, default: '' })
  department: string;

  @Prop({ trim: true, default: '' })
  designation: string;

  @Prop({ default: 'Active', trim: true })
  status: string;

  /** Owning station — always stamped from the active FRIS session. */
  stationCode: string;
}

export const AdvanceStaffSchema = SchemaFactory.createForClass(AdvanceStaff);

AdvanceStaffSchema.plugin(stationAwarePlugin, { required: true });

AdvanceStaffSchema.index({ stationCode: 1, employeeCode: 1 }, { unique: true });
