import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import {
  AdminEmail,
  AdminEmailSchema,
} from '../auth/schema/admin-email.schema';
import {
  PanelUserAdmCounter,
  PanelUserAdmCounterSchema,
} from './schema/panel-user-adm-counter.schema';
import { User, UserSchema } from './schema/user.schema';
import {
  SupportTicket,
  SupportTicketSchema,
} from './schema/support-ticket.schema';
import {
  AdminStation,
  AdminStationSchema,
} from '../admin-stations/schema/admin-station.schema';
import { UserController } from './controllers/user.controller';
import { UserService } from './services/user.service';
import { SupportTicketService } from './services/support-ticket.service';
import { UserRegistrationController } from './registration/controllers/user-registration.controller';
import { UserRegistrationService } from './registration/services/user-registration.service';
import { UserInviteMailerService } from './registration/services/user-invite-mailer.service';
import { PendingApprovalAlertService } from './registration/services/pending-approval-alert.service';

@Module({
  imports: [
    forwardRef(() => AdminModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: PanelUserAdmCounter.name, schema: PanelUserAdmCounterSchema },
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: AdminEmail.name, schema: AdminEmailSchema },
      { name: AdminStation.name, schema: AdminStationSchema },
    ]),
  ],
  controllers: [UserController, UserRegistrationController],
  providers: [
    UserService,
    SupportTicketService,
    UserRegistrationService,
    UserInviteMailerService,
    PendingApprovalAlertService,
  ],
  exports: [UserService, SupportTicketService, UserRegistrationService],
})
export class UserModule {}
