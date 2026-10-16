import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OPERATIONAL_ROLES } from '../../auth/enums/roles.enum';
import { OperationEmployeesService } from '../services/operation-employees.service';
import { CreateOperationEmployeeDto } from '../dto/create-operation-employee.dto';
import { BulkCreateOperationEmployeesDto } from '../dto/bulk-create-operation-employees.dto';

const bulkBodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

@Roles(...OPERATIONAL_ROLES)
@Controller('pax-shift/operation-employees')
export class OperationEmployeesController {
  constructor(
    private readonly operationEmployeesService: OperationEmployeesService,
  ) {}

  @Post()
  create(@Body() dto: CreateOperationEmployeeDto) {
    return this.operationEmployeesService.create(dto);
  }

  @Post('bulk')
  createBulk(@Body(bulkBodyPipe) dto: BulkCreateOperationEmployeesDto) {
    return this.operationEmployeesService.createMany(dto.employees);
  }

  @Get()
  findAll(@Query('filter') filter?: string) {
    return this.operationEmployeesService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.operationEmployeesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateOperationEmployeeDto>,
  ) {
    return this.operationEmployeesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.operationEmployeesService.remove(id);
  }
}
