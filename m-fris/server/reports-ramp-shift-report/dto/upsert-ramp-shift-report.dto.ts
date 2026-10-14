import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OperationalIndicatorsDto {
  @IsOptional() @IsString() totalArrivals?: string;
  @IsOptional() @IsString() totalDepartures?: string;
  @IsOptional() @IsString() paxFlts?: string;
  @IsOptional() @IsString() cargoFlts?: string;
  @IsOptional() @IsString() unschedPax?: string;
  @IsOptional() @IsString() unschedCargo?: string;
  @IsOptional() @IsString() delayAccountable?: string;
  @IsOptional() @IsString() delayUnAccountable?: string;
  @IsOptional() @IsString() otpTarget?: string;
  @IsOptional() @IsString() otpActual?: string;
}

export class UpsertRampShiftReportDto {
  @IsString()
  reportId: string;

  @IsString()
  reportDateYmd: string;

  @IsIn(['day', 'night'])
  shift: 'day' | 'night';

  @IsString()
  manager: string;

  @IsOptional() @IsString() reportBy?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OperationalIndicatorsDto)
  operationalIndicators?: OperationalIndicatorsDto;

  @IsOptional() @IsArray() resourceValues?: string[][];

  @IsOptional() @IsArray() scheduledRows?: Record<string, unknown>[];

  @IsOptional() @IsArray() nonScheduledRows?: Record<string, unknown>[];

  @IsOptional() @IsString() operationalNotes?: string;

  @IsOptional() @IsString() irregularitiesNotes?: string;

  @IsString()
  savedBy: string;

  @IsOptional() @IsBoolean() mailSent?: boolean;
}
