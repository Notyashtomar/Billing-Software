import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNotEmptyObject,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  DashboardEquipmentMode,
  DashboardSummaryCards,
  DashboardSummaryPerf,
} from '../interfaces';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardSummaryPerfDto implements DashboardSummaryPerf {
  @IsNumber()
  @Min(0)
  sourceRows: number;

  @IsNumber()
  @Min(0)
  aggregationMs: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mongoWallMs?: number;

  @IsOptional()
  staWindowCacheHit?: boolean;
}

export class UpsertDashboardSummaryDto {
  @IsString()
  @Matches(YMD, { message: 'summaryDate must be yyyy-MM-dd' })
  summaryDate: string;

  @IsIn(['4h', '6h'])
  equipmentMode: DashboardEquipmentMode;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  generatedAt?: Date;

  @IsObject()
  @IsNotEmptyObject()
  cards: DashboardSummaryCards;

  @IsOptional()
  @IsObject()
  drilldowns?: Record<string, unknown>;

  @ValidateNested()
  @Type(() => DashboardSummaryPerfDto)
  perf: DashboardSummaryPerfDto;
}
