import { Type } from 'class-transformer';
import { IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateOperationEmployeeDto } from './create-operation-employee.dto';

export class BulkCreateOperationEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOperationEmployeeDto)
  employees: CreateOperationEmployeeDto[];
}
