import { IsString, IsNumber, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { AIRLINE_REMARKS_RATING_VALUES } from '../remarks-rating.constants';

export class CreateRemarksDto {
  @IsOptional()
  @IsString()
  Airline?: string;

  @IsOptional()
  @IsString()
  FlightNo?: string;

  @IsOptional()
  @IsBoolean()
  toOpenInTab?: boolean;

  @IsOptional()
  @IsString()
  PaxGHAirlineRep_Name?: string;

  @IsOptional()
  @IsString()
  ghRemarks?: string;

  @IsOptional()
  @IsString()
  ghRep?: string;

  @IsOptional()
  @IsString()
  AirRepRem?: string;

  /** Client form alias for {@link AirRepRem}. */
  @IsOptional()
  @IsString()
  airlineRemarks?: string;

  /** Airline satisfaction rating (required on save; validated in service). */
  @IsOptional()
  @IsString()
  @IsIn([...AIRLINE_REMARKS_RATING_VALUES])
  airlineRemarksRating?: string;

  @IsOptional()
  @IsString()
  airline?: string;

  @IsOptional()
  @IsString()
  flightNo?: string;

  @IsOptional()
  @IsString()
  airlineRep?: string;

  @IsOptional()
  @IsString()
  flightStaDateIso?: string;

  @IsOptional()
  @IsBoolean()
  wantFeedback?: boolean;

  @IsOptional()
  @IsString()
  feedbackRemarks?: string;

  @IsOptional()
  @IsString()
  PAX_Airline_SignByDate?: string;

  @IsOptional()
  @IsString()
  airrep?: string;

  @IsOptional()
  @IsBoolean()
  flightCancelled?: boolean;
}
