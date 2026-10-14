import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** YYYY-MM-DD */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CANCEL_FLIGHT_KINDS = ['scheduled', 'non-scheduled'] as const;
export type CancelFlightKind = (typeof CANCEL_FLIGHT_KINDS)[number];

export function normalizeCancelFlightKind(raw: unknown): CancelFlightKind {
  return String(raw ?? '')
    .trim()
    .toLowerCase() === 'non-scheduled'
    ? 'non-scheduled'
    : 'scheduled';
}

export class CancelFlightDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  flightId: string;

  /** YYYY-MM-DD */
  @IsString()
  @Matches(YMD_RE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsString()
  airlineName?: string;

  @IsOptional()
  @IsString()
  flightNo?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  staDate?: string;

  @IsOptional()
  @IsString()
  staTime?: string;

  @IsOptional()
  @IsString()
  stdDate?: string;

  @IsOptional()
  @IsString()
  stdTime?: string;

  @IsOptional()
  @IsString()
  aircraft?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  intimationMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  intimatedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  intimationPersonEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  intimationMedia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  attachmentFileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  attachmentMimeType?: string;

  /** Base64 proof file (optional). Stripped from list responses; stored as Buffer. */
  @IsOptional()
  @IsString()
  @MaxLength(8_500_000)
  attachmentBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  intimationTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cancelledByUserId?: string;

  /** Distinguishes scheduled vs non-scheduled so histories and daily lists stay separate. */
  @IsOptional()
  @IsIn(CANCEL_FLIGHT_KINDS)
  flightKind?: CancelFlightKind;
}

export class RemoveCancellationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  flightId: string;

  @IsString()
  @Matches(YMD_RE, { message: 'date must be YYYY-MM-DD' })
  date: string;
}

/** Send the standard cancellation info email without a `flight_cancellations` document (e.g. FHR snapshot). */
export class SendCancellationInfoByDetailsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  instanceSerial: string;

  @IsString()
  @Matches(YMD_RE, { message: 'cancelledDate must be YYYY-MM-DD' })
  cancelledDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flightNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  airlineName?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(512)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  intimationMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  intimatedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  intimationPersonEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  intimationMedia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  intimationTime?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  emails: string[];
}
