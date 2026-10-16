import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OperationEmployeeDocument = OperationEmployee & Document;

@Schema({ timestamps: true, collection: 'operation_employees' })
export class OperationEmployee {
  @Prop({ required: true, trim: true })
  employeeName: string;

  @Prop({ required: true, trim: true, unique: true })
  code: string;
}

export const OperationEmployeeSchema =
  SchemaFactory.createForClass(OperationEmployee);
