import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PanelUserAdmCounterDocument = PanelUserAdmCounter & Document;

/** Atomic counter for panel-user admin IDs (100001, …). */
@Schema({ timestamps: true, collection: 'panel_user_adm_counter' })
export class PanelUserAdmCounter {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true, default: 0 })
  seq: number;
}

export const PanelUserAdmCounterSchema =
  SchemaFactory.createForClass(PanelUserAdmCounter);
