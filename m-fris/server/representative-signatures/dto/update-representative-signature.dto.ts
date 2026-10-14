import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Replace / update an existing repository signature. Updating `signatureUrl`
 * is treated as a signature replacement for audit purposes.
 */
export class UpdateRepresentativeSignatureDto {
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(png|jpeg);base64,/, {
    message: 'signatureUrl must be a PNG/JPEG data URL',
  })
  @MaxLength(2_000_000, { message: 'Signature image is too large' })
  signatureUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  station?: string;
}
