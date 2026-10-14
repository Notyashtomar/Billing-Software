import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { DashboardEquipmentMode } from '../interfaces';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class GetDashboardSummaryQueryDto {
  @IsString()
  @Matches(YMD, { message: 'fromDate must be yyyy-MM-dd' })
  fromDate: string;

  @IsString()
  @Matches(YMD, { message: 'tillDate must be yyyy-MM-dd' })
  tillDate: string;

  @IsOptional()
  @IsIn(['4h', '6h'])
  equipmentMode?: DashboardEquipmentMode;
}
