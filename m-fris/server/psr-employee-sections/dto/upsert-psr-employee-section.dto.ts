import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PsrEmployeeSectionRowDto {
  @IsString()
  id: string;

  @IsString()
  employeeCode: string;

  @IsString()
  employeeName: string;
}

export class UpsertPsrEmployeeSectionDto {
  @IsString()
  flightSerial: string;

  @IsString()
  section: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PsrEmployeeSectionRowDto)
  rows: PsrEmployeeSectionRowDto[];
}
