import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OperationEmployee,
  OperationEmployeeSchema,
} from './schema/operation-employee.schema';
import { OperationEmployeesService } from './services/operation-employees.service';
import { OperationEmployeesController } from './controllers/operation-employees.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OperationEmployee.name, schema: OperationEmployeeSchema },
    ]),
  ],
  controllers: [OperationEmployeesController],
  providers: [OperationEmployeesService],
  exports: [OperationEmployeesService],
})
export class OperationEmployeesModule {}
