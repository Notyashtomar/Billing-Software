import { IsString, IsOptional } from 'class-validator';

export class CreateManifestDto {
  @IsOptional()
  @IsString()
  airlineName?: string;

  @IsOptional()
  @IsString()
  flightNumber?: string;

  @IsOptional()
  @IsString()
  place?: string;
}
