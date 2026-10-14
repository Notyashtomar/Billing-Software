import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const ITEM_KINDS = ['equipment', 'manpower', 'service'] as const;

export class CreateBillingRafAdhocRateDto {
  @IsIn([...ITEM_KINDS])
  itemKind: (typeof ITEM_KINDS)[number];

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsString()
  uom: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceINR?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceUSD?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percentValue?: number;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validTo: string;

  @IsOptional()
  @IsBoolean()
  applyToAllStations?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  stationCodes?: string[];
}

export class UpdateBillingRafAdhocRateDto {
  @IsOptional()
  @IsIn([...ITEM_KINDS])
  itemKind?: (typeof ITEM_KINDS)[number];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceINR?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceUSD?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percentValue?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}
