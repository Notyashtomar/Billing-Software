import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateAdvanceAircraftRegistrationDto {
  @IsOptional()
  @IsString()
  airline?: string;

  @IsOptional()
  @IsString()
  regnNo?: string;

  @IsOptional()
  @IsString()
  aircraft?: string;

  @IsOptional()
  @IsString()
  mtow?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
