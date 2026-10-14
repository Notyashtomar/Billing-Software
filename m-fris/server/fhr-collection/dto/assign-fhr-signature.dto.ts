import { IsIn, IsMongoId } from 'class-validator';
import { SIGNATURE_PARTIES, type SignatureParty } from './save-fhr-signature.dto';

/** Assign an existing reusable repository signature to an FHR draft. */
export class AssignFhrSignatureDto {
  @IsIn(SIGNATURE_PARTIES)
  party: SignatureParty;

  @IsMongoId()
  signatureId: string;
}
