import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminEmailDocument = AdminEmail & Document;

@Schema({ timestamps: true, collection: 'adminEmails' })
export class AdminEmail {
  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  appPassword: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const AdminEmailSchema = SchemaFactory.createForClass(AdminEmail);
AdminEmailSchema.index({ isActive: 1, updatedAt: -1 });
