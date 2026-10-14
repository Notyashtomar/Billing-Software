import { IsIn, IsObject, IsString } from 'class-validator';
import { ADVANCE_CARGO_SECTIONS } from '../schema/advance-cargo.schema';

export class UpsertAdvanceCargoSectionDto {
  @IsString()
  entryKey: string;

  @IsIn(ADVANCE_CARGO_SECTIONS)
  section: (typeof ADVANCE_CARGO_SECTIONS)[number];

  @IsObject()
  data: Record<string, unknown>;
}
