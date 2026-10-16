import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminCompanyDocument = AdminCompany & Document;

@Schema({ timestamps: true, collection: 'admin-companies' })
export class AdminCompany {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;

  @Prop({ default: 'Active' })
  status: string;
}

export const AdminCompanySchema = SchemaFactory.createForClass(AdminCompany);
