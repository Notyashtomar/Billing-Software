import { Module } from '@nestjs/common';
import { RawFlightDataModule } from '../raw-flight-data/raw-flight-data.module';
import { FhrCollectionModule } from '../fhr-collection/fhr-collection.module';
import { AdvanceInvoicingController } from './advance-invoicing.controller';
import { AdvanceInvoicingService } from './advance-invoicing.service';

@Module({
  imports: [RawFlightDataModule, FhrCollectionModule],
  controllers: [AdvanceInvoicingController],
  providers: [AdvanceInvoicingService],
  exports: [AdvanceInvoicingService],
})
export class AdvanceInvoicingModule {}
