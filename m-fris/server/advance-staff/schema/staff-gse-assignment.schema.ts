import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class StaffGseAssignment {
  @Prop({ default: '' })
  code: string;

  @Prop({ default: '' })
  name: string;
}

export const StaffGseAssignmentSchema =
  SchemaFactory.createForClass(StaffGseAssignment);
