import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const SIGNATURE_PARTIES = ['gh', 'airline'] as const;
export type SignatureParty = (typeof SIGNATURE_PARTIES)[number];

/**
 * Save / replace a single representative signature (GH or Airline) for an FHR draft.
 * `signatureUrl` must be a PNG data URL produced by the signature canvas.
 */
export class SaveFhrSignatureDto {
  @IsIn(SIGNATURE_PARTIES)
  party: SignatureParty;

  @IsString()
  @Matches(/^data:image\/(png|jpeg);base64,/, {
    message: 'signatureUrl must be a PNG/JPEG data URL',
  })
  @MaxLength(2_000_000, { message: 'Signature image is too large' })
  signatureUrl: string;

  /** Representative name (required for airline; GH is derived from the authenticated user). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  representativeName?: string;
}
