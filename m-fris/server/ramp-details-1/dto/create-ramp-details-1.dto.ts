import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateRampDetails1Dto {
  @IsString()
  airlinesOperator: string;

  @IsString()
  FlightNo: string;

  @IsOptional()
  @IsString()
  Route?: string;

  @IsOptional()
  @IsString()
  Typeofflight?: string;

  @IsOptional()
  @IsString()
  etdDate?: string;

  @IsOptional()
  @IsString()
  TypeCraft?: string;

  @IsOptional()
  @IsString()
  STADate?: string;

  @IsOptional()
  @IsString()
  STDTime?: string;

  @IsOptional()
  @IsString()
  etd?: string;

  @IsOptional()
  @IsString()
  STATime?: string;

  @IsOptional()
  @IsString()
  ATATime?: string;

  @IsOptional()
  @IsString()
  STDDate?: string;

  @IsOptional()
  @IsString()
  ATADate?: string;

  @IsOptional()
  @IsString()
  BayPlanned?: string;

  @IsOptional()
  @IsString()
  BayFinal?: string;

  @IsOptional()
  @IsString()
  arrivalBaggageCount?: string;

  @IsOptional()
  @IsString()
  Fbarr?: string;

  @IsOptional()
  @IsString()
  firstBagArrivalHallDate?: string;

  @IsOptional()
  @IsString()
  firstBagArrivalHallTime?: string;

  @IsOptional()
  @IsString()
  bmaCount?: string;

  @IsOptional()
  @IsString()
  Lbarr?: string;

  @IsOptional()
  @IsString()
  bagreco?: string;

  @IsOptional()
  @IsString()
  lastBagArrivalHallDate?: string;

  @IsOptional()
  @IsString()
  lastBagArrivalHallTime?: string;

  @IsOptional()
  @IsString()
  bbaBelt?: string;

  @IsOptional()
  @IsString()
  Fbmup?: string;

  @IsOptional()
  @IsString()
  firstBagInBmaDate?: string;

  @IsOptional()
  @IsString()
  firstBagInBmaTime?: string;

  @IsOptional()
  @IsString()
  airlinecount?: string;

  @IsOptional()
  @IsString()
  Lbmup?: string;

  @IsOptional()
  @IsString()
  lastBagInBmaDate?: string;

  @IsOptional()
  @IsString()
  lastBagInBmaTime?: string;

  @IsOptional()
  @IsBoolean()
  xRay?: boolean;

  @IsOptional()
  @IsString()
  CleaningFr?: string;

  @IsOptional()
  @IsString()
  cleaningStartedTime?: string;

  @IsOptional()
  @IsBoolean()
  oneSidedBelt?: boolean;

  @IsOptional()
  @IsBoolean()
  customChecked?: boolean;

  @IsOptional()
  @IsString()
  CleaningTo?: string;

  @IsOptional()
  @IsString()
  cleaningClosedTime?: string;

  @IsOptional()
  @IsString()
  HoldCnfLDC?: string;

  @IsOptional()
  @IsString()
  HoldCnfLDP?: string;

  @IsOptional()
  @IsString()
  HoldCnfMDP?: string;

  @IsOptional()
  @IsString()
  holdConfig?: string;

  @IsOptional()
  @IsString()
  cgopcsin?: string;

  @IsOptional()
  @IsString()
  cgopcout?: string;

  @IsOptional()
  @IsString()
  Courierout?: string;

  @IsOptional()
  @IsString()
  Courierin?: string;

  @IsOptional()
  @IsBoolean()
  ifNightHalt?: boolean;

  @IsOptional()
  @IsString()
  Frontopen?: string;

  @IsOptional()
  @IsString()
  holdOpenFrontTime?: string;

  @IsOptional()
  @IsString()
  Rearopen?: string;

  @IsOptional()
  @IsString()
  holdOpenRearTime?: string;

  @IsOptional()
  @IsString()
  Bulkopen?: string;

  @IsOptional()
  @IsString()
  holdOpenBulkTime?: string;

  @IsOptional()
  @IsString()
  MDopen?: string;

  @IsOptional()
  @IsString()
  holdOpenMainDeckTime?: string;

  @IsOptional()
  @IsString()
  Frontclose?: string;

  @IsOptional()
  @IsString()
  holdCloseFrontTime?: string;

  @IsOptional()
  @IsString()
  Rearclose?: string;

  @IsOptional()
  @IsString()
  holdCloseRearTime?: string;

  @IsOptional()
  @IsString()
  Bulkclose?: string;

  @IsOptional()
  @IsString()
  holdCloseBulkTime?: string;

  @IsOptional()
  @IsString()
  MDclose?: string;

  @IsOptional()
  @IsString()
  holdCloseMainDeckTime?: string;

  @IsOptional()
  @IsString()
  LasteActivityOnHold?: string;

  @IsOptional()
  @IsString()
  lastActivityHoldTime?: string;

  @IsOptional()
  @IsString()
  uldarr?: string;

  @IsOptional()
  @IsString()
  cgoarr?: string;

  @IsOptional()
  @IsString()
  mailarr?: string;

  @IsOptional()
  @IsString()
  uldplan?: string;

  @IsOptional()
  @IsString()
  cgoactdep?: string;

  @IsOptional()
  @IsString()
  mailplan?: string;

  @IsOptional()
  @IsString()
  uldatcdep?: string;

  @IsOptional()
  @IsString()
  cgoplan?: string;

  @IsOptional()
  @IsString()
  mailactdep?: string;

  @IsOptional()
  @IsString()
  transitcgo?: string;

  @IsOptional()
  @IsString()
  transitCargoWeight?: string;

  @IsOptional()
  @IsString()
  transitCargoMail?: string;
}
