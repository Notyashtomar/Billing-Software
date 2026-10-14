import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EquipmentManpowerEntryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  entryType?: string;

  @IsOptional()
  @IsString()
  equipmentName?: string;

  @IsOptional()
  @IsString()
  equipmentSerialNo?: string;

  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  place?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  fromTime?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  toTime?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  exportedInNav?: string;
}

export class CreateEquipmentManpowerDto {
  // @IsNumber()
  // serialNo: number;

  @IsOptional()
  @IsString()
  airlinesOperator?: string;

  @IsOptional()
  @IsString()
  flightNo?: string;

  @IsOptional()
  @IsString()
  routing?: string;

  @IsOptional()
  @IsString()
  operations?: string;

  @IsOptional()
  @IsString()
  acType?: string;

  @IsOptional()
  @IsString()
  sta?: string;

  @IsOptional()
  @IsString()
  staDate?: string;

  @IsOptional()
  @IsString()
  std?: string;

  @IsOptional()
  @IsString()
  stdDate?: string;

  @IsOptional()
  @IsString()
  atdDate?: string;

  @IsOptional()
  @IsString()
  listType?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EquipmentManpowerEntryDto)
  entries?: EquipmentManpowerEntryDto[];

  @IsOptional()
  @IsString()
  verifiedBy?: string;

  @IsOptional()
  @IsString()
  verifiedByCode?: string;

  @IsOptional()
  @IsString()
  verifiedAt?: string;
}
