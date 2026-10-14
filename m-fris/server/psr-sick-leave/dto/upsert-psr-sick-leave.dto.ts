import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class PsrSickLeaveRowDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  employeeCode: string;

  @IsString()
  employeeName: string;
}

export class UpsertPsrSickLeaveDto {
  @IsString()
  @IsNotEmpty()
  flightSerial: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PsrSickLeaveRowDto)
  rows: PsrSickLeaveRowDto[];
}
