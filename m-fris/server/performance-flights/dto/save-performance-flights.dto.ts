import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** One leg: same four fields as Bird `performanceFlights` in dashboard JSON. */
export class PerformanceFlightLegDto {
  @IsOptional()
  @IsString()
  sta?: string;

  @IsOptional()
  @IsString()
  ata?: string;

  @IsOptional()
  @IsString()
  std?: string;

  @IsOptional()
  @IsString()
  atd?: string;
}

/**
 * Body for POST /performance-flights — upsert one snapshot keyed by `reportKey`.
 */
export class SavePerformanceFlightsDto {
  @IsString()
  @IsNotEmpty()
  reportKey: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceFlightLegDto)
  flights: PerformanceFlightLegDto[];
}
