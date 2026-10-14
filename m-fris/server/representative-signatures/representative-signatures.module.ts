import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RepresentativeSignature,
  RepresentativeSignatureSchema,
} from './schema/representative-signature.schema';
import { AuditLog, AuditLogSchema } from '../admin-audit/schema/audit-log.schema';
import { RepresentativeSignatureService } from './services/representative-signature.service';
import { RepresentativeSignatureController } from './controllers/representative-signature.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: RepresentativeSignature.name,
        schema: RepresentativeSignatureSchema,
      },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [RepresentativeSignatureController],
  providers: [RepresentativeSignatureService],
  exports: [RepresentativeSignatureService, MongooseModule],
})
export class RepresentativeSignaturesModule {}
