import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateTerminalDetailsDto {
  @IsString()
  airlinesOperator: string;

  @IsString()
  FlightNo: string;

  @IsOptional()
  @IsString()
  routing?: string;

  @IsOptional()
  @IsString()
  Typeofflight?: string;

  @IsOptional()
  @IsString()
  TypeCraft?: string;

  @IsOptional()
  @IsString()
  STATime?: string;

  @IsOptional()
  @IsString()
  STADate?: string;

  @IsOptional()
  @IsString()
  STDTime?: string;

  @IsOptional()
  @IsString()
  STDDate?: string;

  @IsOptional()
  @IsString()
  IGMNo?: string;

  @IsOptional()
  @IsString()
  EGMNo?: string;

  @IsOptional()
  @IsString()
  dpr?: string;

  @IsOptional()
  @IsString()
  ohd?: string;

  @IsOptional()
  @IsString()
  offLoadPax?: string;

  @IsOptional()
  @IsString()
  ahl?: string;

  @IsOptional()
  @IsString()
  GatePlanned?: string;

  @IsOptional()
  @IsString()
  GateFinal?: string;

  @IsOptional()
  @IsString()
  cntclose?: string;

  @IsOptional()
  @IsString()
  cntopen?: string;

  @IsOptional()
  @IsString()
  SystemBagCount?: string;

  @IsOptional()
  @IsString()
  brdopen?: string;

  @IsOptional()
  @IsString()
  brdclose?: string;

  @IsOptional()
  @IsString()
  beltNo?: string;

  @IsOptional()
  @IsString()
  arrivalpax?: string;

  @IsOptional()
  @IsString()
  deppax?: string;

  @IsOptional()
  @IsString()
  transit?: string;

  @IsOptional()
  @IsString()
  CabincnfF?: string;

  @IsOptional()
  @IsString()
  CabincnfC?: string;

  @IsOptional()
  @IsString()
  CabincnfY?: string;

  @IsOptional()
  @IsString()
  wcr?: string;

  @IsOptional()
  @IsString()
  wcs?: string;

  @IsOptional()
  @IsString()
  wcc?: string;

  @IsOptional()
  @IsString()
  Departure_wcr?: string;

  @IsOptional()
  @IsString()
  Departure_wcs?: string;

  @IsOptional()
  @IsString()
  Departure_wcc?: string;

  /** Set true only by Terminal Details form Save — not Excel/FHR seed. */
  @IsOptional()
  @IsBoolean()
  enteredFromForm?: boolean;
}
