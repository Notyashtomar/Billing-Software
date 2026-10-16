import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminCompaniesController } from './controllers/admin-companies.controller';
import {
  AdminCompany,
  AdminCompanySchema,
} from './schema/admin-company.schema';
import { AdminCompaniesService } from './services/admin-companies.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminCompany.name, schema: AdminCompanySchema },
    ]),
  ],
  controllers: [AdminCompaniesController],
  providers: [AdminCompaniesService],
  exports: [AdminCompaniesService],
})
export class AdminCompaniesModule {}
