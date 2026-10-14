import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryScheduledFlightDataDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsOptional()
  @IsIn(['atd-date', 'exported-date'])
  dateBasis?: 'atd-date' | 'exported-date';

  @IsOptional()
  @IsIn(['flight-report', 'equipment-manpower'])
  dataMode?: 'flight-report' | 'equipment-manpower';
}
