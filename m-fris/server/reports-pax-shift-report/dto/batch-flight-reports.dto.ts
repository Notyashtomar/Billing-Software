import { IsArray, IsString } from 'class-validator';

export class BatchFlightReportsDto {
  @IsArray()
  @IsString({ each: true })
  flightSerials: string[];
}
