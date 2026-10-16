import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SupportTicket,
  SupportTicketSchema,
} from '../user/schema/support-ticket.schema';
import { AdminIncidentsController } from './controllers/admin-incidents.controller';
import { Incident, IncidentSchema } from './schema/incident.schema';
import { AdminIncidentsService } from './services/admin-incidents.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Incident.name, schema: IncidentSchema },
      { name: SupportTicket.name, schema: SupportTicketSchema },
    ]),
  ],
  controllers: [AdminIncidentsController],
  providers: [AdminIncidentsService],
  exports: [AdminIncidentsService],
})
export class AdminIncidentsModule {}
