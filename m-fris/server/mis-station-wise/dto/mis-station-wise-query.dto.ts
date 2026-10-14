import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class MisStationWiseQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;

  /** `scheduled` (default) → fhr_collection; `nonScheduled` → ns_fhr_collection. */
  @IsOptional()
  @IsString()
  @IsIn(['scheduled', 'nonScheduled', 'nonscheduled', 'non-scheduled', 'ns'])
  flightScope?: string;
}
