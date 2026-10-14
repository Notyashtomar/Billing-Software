import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EmployeeAllocationRowDto {
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  dutyAllocation?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateRampDetails3Dto {
  @IsOptional()
  @IsString()
  Airline?: string;

  @IsOptional()
  @IsString()
  FlightNo?: string;

  @IsOptional()
  @IsString()
  aircraft?: string;

  @IsOptional()
  @IsString()
  Typeofflight?: string;

  @IsOptional()
  @IsString()
  STADate?: string;

  @IsOptional()
  @IsString()
  STATime?: string;

  @IsOptional()
  @IsString()
  STDDate?: string;

  @IsOptional()
  @IsString()
  STDTime?: string;

  @IsOptional()
  @IsString()
  Route?: string;

  @IsOptional()
  @IsString()
  ATADate?: string;

  @IsOptional()
  @IsString()
  ATATime?: string;

  @IsOptional()
  @IsString()
  ATDDate?: string;

  @IsOptional()
  @IsString()
  ATDTime?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeAllocationRowDto)
  employeeAllocations?: EmployeeAllocationRowDto[];
}
