import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class SaveAdvanceCargoFlightDto {
  @IsString()
  entryKey: string;

  @IsIn(['cargoScheduled', 'flightCreation'])
  section: 'cargoScheduled' | 'flightCreation';

  @IsObject()
  data: Record<string, unknown>;

  @IsObject()
  flightPayload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  serialNo?: string;
}
