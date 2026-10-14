import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DelayEntryDto {
  @IsOptional()
  @IsString()
  Delay?: string;

  @IsOptional()
  @IsString()
  ReasonofDelay?: string;

  @IsOptional()
  @IsBoolean()
  gh?: boolean;

  @IsOptional()
  @IsBoolean()
  oth?: boolean;
}

export class CreateMainDetailsDto {
  @IsString()
  @IsNotEmpty()
  Airline: string;

  @IsOptional()
  @IsString()
  CompanyName?: string;

  @IsOptional()
  @IsString()
  operator?: string;

  @IsString()
  @IsNotEmpty()
  Arline_Code: string;

  @IsOptional()
  @IsBoolean()
  ifOperationSplit?: boolean;

  @IsOptional()
  @IsString()
  ArrivalFltNo?: string;

  @IsOptional()
  @IsString()
  DepartureFltNo?: string;

  @IsOptional()
  @IsString()
  FlightNo?: string;

  @IsOptional()
  @IsString()
  STADate?: string;

  @IsOptional()
  @IsString()
  STATime?: string;

  @IsOptional()
  @IsString()
  STDDate?: string;

  @IsOptional()
  @IsString()
  STDTime?: string;

  @IsOptional()
  @IsString()
  ATADate?: string;

  @IsOptional()
  @IsString()
  ATATime?: string;

  @IsOptional()
  @IsString()
  ATDDate?: string;

  @IsOptional()
  @IsString()
  ATDTime?: string;

  @IsOptional()
  @IsString()
  IPosDate?: string;

  @IsOptional()
  @IsString()
  IPosTime?: string;

  @IsOptional()
  @IsString()
  etdDate?: string;

  @IsOptional()
  @IsString()
  ETDtime?: string;

  @IsOptional()
  @IsString()
  Regn?: string;

  @IsOptional()
  @IsString()
  Terminal?: string;

  @IsOptional()
  @IsString()
  Route?: string;

  @IsOptional()
  @IsString()
  Typeofflight?: string;

  @IsOptional()
  @IsString()
  TypeofHandling?: string;

  @IsOptional()
  @IsString()
  Cate_of_Flight?: string;

  @IsOptional()
  @IsBoolean()
  stationBaseNightHalt?: boolean;

  @IsOptional()
  @IsString()
  TypeCraft?: string;

  @IsOptional()
  @IsString()
  MTOW?: string;

  @IsOptional()
  @IsBoolean()
  freighter?: boolean;

  @IsOptional()
  @IsBoolean()
  medicalPassenger?: boolean;

  @IsOptional()
  @IsString()
  aircraftBody?: string;

  @IsOptional()
  @IsBoolean()
  returnToRamp?: boolean;

  @IsOptional()
  @IsBoolean()
  stdLessThanSta?: boolean;

  @IsOptional()
  @IsString()
  ActualDelay?: string;

  @IsOptional()
  @IsString()
  departureStatus?: string;

  @IsOptional()
  @IsString()
  departureDelay?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DelayEntryDto)
  departureDelays?: DelayEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DelayEntryDto)
  arrivalDelays?: DelayEntryDto[];

  @IsOptional()
  @IsString()
  PAX_Airline_SignByDate?: string;

  @IsOptional()
  @IsString()
  airrep?: string;

  @IsOptional()
  @IsBoolean()
  flightCancelled?: boolean;

  @IsOptional()
  @IsBoolean()
  shareFhrToAirline?: boolean;

  @IsOptional()
  @IsBoolean()
  shareReportsToGhRep?: boolean;

  @IsOptional()
  @IsString()
  bookingNo?: string;

  @IsOptional()
  @IsString()
  challanNo?: string;
}
