import { IsString, IsOptional } from 'class-validator';

export class CreateLoadControlDetailsDto {
  @IsString()
  airlinesOperator: string;

  @IsString()
  FlightNo: string;

  @IsOptional()
  @IsString()
  routing?: string;

  @IsOptional()
  @IsString()
  TypeCraft?: string;

  @IsOptional()
  @IsString()
  STDTime?: string;

  @IsOptional()
  @IsString()
  Typeofflight?: string;

  @IsOptional()
  @IsString()
  STATime?: string;

  @IsOptional()
  @IsString()
  STADate?: string;

  @IsOptional()
  @IsString()
  STDDate?: string;

  @IsOptional()
  @IsString()
  loadingDiagramGivenAt?: string;

  @IsOptional()
  @IsString()
  loadingSheetPrintedAt?: string;

  @IsOptional()
  @IsString()
  loadingSheetDeliveredAt?: string;

  @IsOptional()
  @IsString()
  flightPlanFieldAt?: string;

  @IsOptional()
  @IsString()
  FICNO?: string;

  @IsOptional()
  @IsString()
  ADCNO?: string;

  /** Frontend alias for `ADCNO` (survives global ValidationPipe whitelist). */
  @IsOptional()
  @IsString()
  adc?: string;

  /** Frontend alias for `FICNO`. */
  @IsOptional()
  @IsString()
  fic?: string;
}
