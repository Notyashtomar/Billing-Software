import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EquipmentManpowerEntryDto } from './create-equipment-manpower.dto';

export class EquipmentManpowerCatalogItemPatchDto {
  @IsOptional()
  @IsString()
  abbr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  unit_type?: string;

  /** Motorised / non-motorised / towable: `M` | `NM` | `T` (dashboard equipment utilization). */
  @IsOptional()
  @IsString()
  category?: string;
}

/** Advance admin: partial update of any `equipmentManpower` document by Mongo `_id`. */
export class AdminPatchEquipmentManpowerDto {
  @IsOptional()
  @IsNumber()
  serialNo?: number;

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
  @IsBoolean()
  isEquipmentManpowerCatalog?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EquipmentManpowerEntryDto)
  entries?: EquipmentManpowerEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EquipmentManpowerCatalogItemPatchDto)
  catalogItems?: EquipmentManpowerCatalogItemPatchDto[];

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
