import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmployeeDocument = Employee & Document;

@Schema({ timestamps: true, collection: 'employees' })
export class Employee {
  @Prop({ default: '' })
  employeeCode: string;

  @Prop({ default: '' })
  employeeName: string;

  @Prop({ default: '' })
  designation: string;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
