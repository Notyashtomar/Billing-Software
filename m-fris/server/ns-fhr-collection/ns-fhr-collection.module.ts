import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  NsFhrCollection,
  NsFhrCollectionSchema,
} from './schema/ns-fhr-collection.schema';
import { NsFhrCollectionService } from './services/ns-fhr-collection.service';
import { MaaNsFhrExcelSeedService } from './services/maa-ns-fhr-excel-seed.service';
import { MaaNsEquipmentExcelSeedService } from './services/maa-ns-equipment-excel-seed.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NsFhrCollection.name, schema: NsFhrCollectionSchema },
    ]),
  ],
  providers: [
    NsFhrCollectionService,
    MaaNsFhrExcelSeedService,
    MaaNsEquipmentExcelSeedService,
  ],
  exports: [
    NsFhrCollectionService,
    MaaNsFhrExcelSeedService,
    MaaNsEquipmentExcelSeedService,
    MongooseModule,
  ],
})
export class NsFhrCollectionModule {}
