import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PRICE_CARD_HANDLING_TYPES = ['BHS', 'ADS', 'RAF'] as const;
type PriceCardHandlingType = (typeof PRICE_CARD_HANDLING_TYPES)[number];

export class CreateBillingPriceCardAirlineRowDto {
  @IsString()
  customerCode: string;

  @IsString()
  airlineName: string;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validTo: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsString()
  aircraftType: string;

  @IsEnum(['Dom', 'Int', 'Ta'])
  category: 'Dom' | 'Int' | 'Ta';

  @IsOptional()
  @IsNumber()
  price?: number;

  /** BHS only. Defaults to scheduled when omitted. */
  @IsOptional()
  @IsEnum(['scheduled', 'additional'])
  flightOperation?: 'scheduled' | 'additional';
}

export class BulkCreateBillingPriceCardAirlinesDto {
  @IsEnum(PRICE_CARD_HANDLING_TYPES)
  handlingType: PriceCardHandlingType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBillingPriceCardAirlineRowDto)
  rows: CreateBillingPriceCardAirlineRowDto[];
}

export class ListBillingPriceCardAirlinesQueryDto {
  @IsOptional()
  @IsEnum(PRICE_CARD_HANDLING_TYPES)
  handlingType?: PriceCardHandlingType;

  @IsOptional()
  @IsString()
  customerCode?: string;
}

export class UpdateBillingPriceCardAirlineDto {
  @IsString()
  airlineName: string;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validTo: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsString()
  aircraftType: string;

  @IsEnum(['Dom', 'Int', 'Ta'])
  category: 'Dom' | 'Int' | 'Ta';

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsEnum(['scheduled', 'additional'])
  flightOperation?: 'scheduled' | 'additional';

  @IsOptional()
  @IsBoolean()
  incrementalFlightsActive?: boolean;

  @IsOptional()
  @IsNumber()
  incrementalPrice?: number;
}
