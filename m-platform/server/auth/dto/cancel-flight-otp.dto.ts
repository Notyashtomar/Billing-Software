import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum OtpPurpose {
  CANCEL_STEP_1 = 'cancel-step-1',
  CANCEL_STEP_2 = 'cancel-step-2',
  REOPEN_STEP_1 = 'reopen-step-1',
  REOPEN_STEP_2 = 'reopen-step-2',
}

export class CancellationAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_500_000)
  base64?: string;
}

export class CancellationFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  intimationTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  intimatedBy?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  intimationPersonEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  intimationMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proofNote?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CancellationAttachmentDto)
  attachment?: CancellationAttachmentDto;
}

export class FlightSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  airlineName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flightNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  aircraftType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  airlineRepresentativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  staDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  staTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stdDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  stdTime?: string;
}

export class SendCancelFlightOtpDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(32)
  flightId: string;

  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;

  @IsOptional()
  @IsIn(['scheduled', 'non-scheduled'])
  flightKind?: 'scheduled' | 'non-scheduled';
}

export class VerifyCancelFlightOtpDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(32)
  flightId: string;

  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CancellationFormDto)
  cancellationForm?: CancellationFormDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FlightSnapshotDto)
  flightSnapshot?: FlightSnapshotDto;

  @IsOptional()
  @IsIn(['scheduled', 'non-scheduled'])
  flightKind?: 'scheduled' | 'non-scheduled';
}
