import { IsObject, IsString } from 'class-validator';

export class UpsertPsrFlightDetailsDto {
  @IsString()
  flightSerial: string;

  @IsObject()
  data: Record<string, unknown>;
}
