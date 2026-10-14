import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertFlightDetailsDto {
  @IsString()
  flightSerial: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  flightSnapshot?: Record<string, string>;
}
