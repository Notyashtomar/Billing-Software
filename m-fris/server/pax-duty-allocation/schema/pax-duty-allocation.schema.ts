import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaxDutyAllocationDocument = HydratedDocument<PaxDutyAllocation>;

@Schema({ _id: false })
export class StaffAssignment {
  /** Display string, e.g. "Name (CODE)". */
  @Prop({ default: '' })
  staff: string;

  @Prop({ default: '' })
  employeeCode: string;

  @Prop({ default: '' })
  employeeName: string;

  @Prop({ type: [String], default: [] })
  dutyAllocations: string[];
}

const StaffAssignmentSchema = SchemaFactory.createForClass(StaffAssignment);

@Schema({ timestamps: true, collection: 'psr-duty-allocation' })
export class PaxDutyAllocation {
  @Prop({ required: true, trim: true })
  date: string;

  @Prop({ default: '' })
  shift: string;

  @Prop({ default: '' })
  flight: string;

  @Prop({ default: '' })
  flightNo: string;

  @Prop({ type: [StaffAssignmentSchema], default: [] })
  staffAssignments: StaffAssignment[];
}

export const PaxDutyAllocationSchema =
  SchemaFactory.createForClass(PaxDutyAllocation);
