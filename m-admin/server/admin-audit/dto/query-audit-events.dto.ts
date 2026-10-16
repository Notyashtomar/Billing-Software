import { IsIn, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  AUDIT_EVENT_TYPES,
  AUDIT_KPI_FILTERS,
  AUDIT_MODULES,
  AUDIT_RESULTS,
  AUDIT_SEVERITIES,
} from '../constants/audit.enums';

export class QueryAuditEventsDto {
  @IsOptional()
  @IsString()
  datePreset?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  userSearch?: string;

  @IsOptional()
  @IsString()
  station?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsIn([...AUDIT_MODULES])
  module?: string;

  @IsOptional()
  @IsIn([...AUDIT_EVENT_TYPES])
  eventType?: string;

  @IsOptional()
  @IsIn([...AUDIT_SEVERITIES])
  severity?: string;

  @IsOptional()
  @IsIn([...AUDIT_RESULTS])
  result?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsIn([...AUDIT_KPI_FILTERS])
  kpiFilter?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class QueryAuditKpisDto {
  @IsOptional()
  @IsString()
  datePreset?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;
}
