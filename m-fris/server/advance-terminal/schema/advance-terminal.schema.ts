import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceTerminalDocument = AdvanceTerminal & Document;

@Schema({ timestamps: true, collection: 'advance-terminal' })
export class AdvanceTerminal {
  @Prop({ default: '' })
  name: string;

  @Prop({ default: '' })
  terminalCode: string;

  @Prop({ default: '' })
  location: string;

  @Prop({ default: false })
  block: boolean;

  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;
}

export const AdvanceTerminalSchema =
  SchemaFactory.createForClass(AdvanceTerminal);

AdvanceTerminalSchema.plugin(stationAwarePlugin, { required: false });
