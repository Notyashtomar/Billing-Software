import { IsString, IsOptional } from 'class-validator';

export class CreateAdvanceAirlineLogoDto {
  @IsOptional()
  @IsString()
  airlineName?: string;

  @IsOptional()
  @IsString()
  logoDataUrl?: string;
}
