import {
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaxShiftEmployeeRowDto } from './pax-shift-employee-row.dto';

export class UpsertFlightReportSectionDto {
  @IsString()
  flightSerial: string;

  @IsString()
  section: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PaxShiftEmployeeRowDto)
  rows: PaxShiftEmployeeRowDto[];

  @IsOptional()
  @IsObject()
  flightSnapshot?: Record<string, string>;
}
