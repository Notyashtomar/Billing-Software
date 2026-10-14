import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { REPRESENTATIVE_TYPES, type RepresentativeType } from '../schema/representative-signature.schema';

/** Create a new reusable representative signature in the repository. */
export class CreateRepresentativeSignatureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  representativeName: string;

  @IsIn(REPRESENTATIVE_TYPES)
  representativeType: RepresentativeType;

  @IsString()
  @Matches(/^data:image\/(png|jpeg);base64,/, {
    message: 'signatureUrl must be a PNG/JPEG data URL',
  })
  @MaxLength(2_000_000, { message: 'Signature image is too large' })
  signatureUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  station?: string;
}
