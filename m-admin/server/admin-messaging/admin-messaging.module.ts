import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminMessagingController } from './controllers/admin-messaging.controller';
import { MessageLog, MessageLogSchema } from './schema/message-log.schema';
import { OtpLog, OtpLogSchema } from './schema/otp-log.schema';
import { AdminMessagingService } from './services/admin-messaging.service';
import { MessagingRecorderService } from './services/messaging-recorder.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessageLog.name, schema: MessageLogSchema },
      { name: OtpLog.name, schema: OtpLogSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AdminMessagingController],
  providers: [AdminMessagingService, MessagingRecorderService],
  exports: [MessagingRecorderService],
})
export class AdminMessagingModule {}
