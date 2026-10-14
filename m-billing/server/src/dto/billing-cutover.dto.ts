import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CUTOVER_PHASES } from '../shared/enums';

export class CutoverReconciliationQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  customerCode?: string;
}

export class UpdateCutoverSettingsDto {
  @IsOptional()
  @IsBoolean()
  nativeBillingEnabled?: boolean;

  @IsOptional()
  @IsEnum(CUTOVER_PHASES)
  cutoverPhase?: (typeof CUTOVER_PHASES)[number];

  @IsOptional()
  @IsDateString()
  parallelRunStartDate?: string;

  @IsOptional()
  @IsDateString()
  bcReadOnlyDate?: string;

  @IsOptional()
  @IsDateString()
  frisPrimaryDate?: string;
}

export class BackfillPreparationDto {
  @IsDateString()
  billingPeriodStart: string;

  @IsDateString()
  billingPeriodEnd: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

class BcBaselineRowDto {
  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsNumber()
  totalInclTax: number;
}

export class ImportBcBaselineDto {
  @IsDateString()
  billingPeriodStart: string;

  @IsDateString()
  billingPeriodEnd: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BcBaselineRowDto)
  rows: BcBaselineRowDto[];
}

export class CaptureParallelSnapshotDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  weekLabel?: string;

  @IsOptional()
  @IsNumber()
  weekNumber?: number;

  @IsOptional()
  @IsString()
  customerCode?: string;
}

export class SignOffParallelPeriodDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ListParallelSnapshotsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}

export class ExecuteDecommissionDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class RollbackDecommissionDto {
  @IsString()
  reason: string;
}
