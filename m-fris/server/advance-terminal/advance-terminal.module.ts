import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceTerminal,
  AdvanceTerminalSchema,
} from './schema/advance-terminal.schema';
import { AdvanceTerminalService } from './services/advance-terminal.service';
import { AdvanceTerminalController } from './controllers/advance-terminal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceTerminal.name, schema: AdvanceTerminalSchema },
    ]),
  ],
  controllers: [AdvanceTerminalController],
  providers: [AdvanceTerminalService],
  exports: [AdvanceTerminalService],
})
export class AdvanceTerminalModule {}
