import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PsrEmployeeSection,
  PsrEmployeeSectionSchema,
} from './schema/psr-employee-section.schema';
import { PsrEmployeeSectionsController } from './controllers/psr-employee-sections.controller';
import { PsrEmployeeSectionsService } from './services/psr-employee-sections.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PsrEmployeeSection.name, schema: PsrEmployeeSectionSchema },
    ]),
  ],
  controllers: [PsrEmployeeSectionsController],
  providers: [PsrEmployeeSectionsService],
  exports: [PsrEmployeeSectionsService],
})
export class PsrEmployeeSectionsModule {}
