import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Single row for bulk aircraft type import from Excel. */
export class BulkCreateAdvanceAircraftItemDto {
  @IsOptional()
  @IsString()
  aircraft?: string;

  @IsOptional()
  @IsString()
  aircraftBody?: string;

  @IsOptional()
  @IsString()
  mtow?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  icaoCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Wingspan must be greater than 0.' })
  @Max(200)
  wingspan?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999, { message: 'Passenger capacity must be less than 1000.' })
  passengerCapacity?: number | null;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject()
  universalRow?: Record<string, string>;
}
