import { IsEnum, IsOptional, IsString } from 'class-validator';

export class BillingSourcesQueryDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsOptional()
  @IsEnum(['schedule-date', 'atd-date', 'exported-date'])
  dateBasis?: 'schedule-date' | 'atd-date' | 'exported-date';

  @IsOptional()
  @IsString()
  customerCode?: string;
}
