import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ShortShippedBagRowDto {
  @IsString()
  id: string;

  @IsString()
  optionSection: string;

  @IsString()
  remarks: string;
}

export class UpsertShortShippedBagsDto {
  @IsString()
  flightSerial: string;

  /** Non-negative integer bag count. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return undefined;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? Math.max(0, n) : undefined;
  })
  @IsNumber()
  @Min(0)
  noOfBags?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ShortShippedBagRowDto)
  rows?: ShortShippedBagRowDto[];

  /** Denormalized schedule row (airline, flight no., STD) for list views without date-window match. */
  @IsOptional()
  @IsObject()
  flightSnapshot?: Record<string, string>;
}
