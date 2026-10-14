import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Single row for bulk non-scheduled airline contact import. */
export class BulkCreateAdvanceNsContactItemDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  airline?: string;

  @IsOptional()
  @IsString()
  airlineRepresentative?: string;

  @IsOptional()
  @IsString()
  mobileNo?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  weekDay?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000, { message: 'Signature image is too large' })
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^data:image\/(png|jpeg);base64,/, {
    message: 'signatureUrl must be a PNG/JPEG data URL',
  })
  signatureUrl?: string;
}
