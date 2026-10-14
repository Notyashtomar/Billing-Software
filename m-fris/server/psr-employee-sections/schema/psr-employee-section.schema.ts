import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PsrEmployeeSectionDocument = HydratedDocument<PsrEmployeeSection>;

@Schema({ _id: false })
export class PsrEmployeeSectionRow {
  @Prop({ required: true, trim: true })
  id: string;

  @Prop({ default: '' })
  employeeCode: string;

  @Prop({ default: '' })
  employeeName: string;
}

const PsrEmployeeSectionRowSchema = SchemaFactory.createForClass(
  PsrEmployeeSectionRow,
);

@Schema({ timestamps: true, collection: 'psr-employee-sections' })
export class PsrEmployeeSection {
  @Prop({ required: true, trim: true })
  flightSerial: string;

  @Prop({ required: true, trim: true })
  section: string;

  @Prop({ type: [PsrEmployeeSectionRowSchema], default: [] })
  rows: PsrEmployeeSectionRow[];
}

export const PsrEmployeeSectionSchema =
  SchemaFactory.createForClass(PsrEmployeeSection);

PsrEmployeeSectionSchema.index(
  { flightSerial: 1, section: 1 },
  { unique: true, name: 'uniq_flight_serial_section' },
);
