import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PsrSickLeaveDocument = HydratedDocument<PsrSickLeave>;

@Schema({ _id: false })
export class PsrSickLeaveRow {
  @Prop({ required: true })
  id: string;

  @Prop({ default: '' })
  employeeCode: string;

  @Prop({ default: '' })
  employeeName: string;
}

const PsrSickLeaveRowSchema = SchemaFactory.createForClass(PsrSickLeaveRow);

@Schema({ timestamps: true, collection: 'psr-sick-leave' })
export class PsrSickLeave {
  @Prop({ required: true, unique: true, trim: true })
  flightSerial: string;

  @Prop({ type: [PsrSickLeaveRowSchema], default: [] })
  rows: PsrSickLeaveRow[];
}

export const PsrSickLeaveSchema = SchemaFactory.createForClass(PsrSickLeave);
