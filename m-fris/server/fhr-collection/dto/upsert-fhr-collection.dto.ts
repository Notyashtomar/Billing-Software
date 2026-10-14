import { IsArray, IsObject, IsOptional } from 'class-validator';

/**
 * Partial FHR body. Keys mirror `FhrCollection` and source collections:
 * `mainDetails`, `terminalDetails`, `loadControlDetails`, `rampDetails1`, `rampDetails2`[],
 * `rampDetails3`, `remarks`, `equipmentManpower`, `equipmentDetails`, `attachments`, `reports`,
 * `rafCleaningServices`, `rafAdhocDetails`.
 */
export class UpsertFhrCollectionDto {
  @IsOptional()
  @IsObject()
  mainDetails?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  terminalDetails?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  loadControlDetails?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  rampDetails1?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  rampDetails2?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  rampDetails3?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  remarks?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  equipmentManpower?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  equipmentDetails?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  attachments?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  reports?: Record<string, unknown>[];

  /** RAF Open → Cleaning Services (Deep / Night Halt / Exterior) keyed payload. */
  @IsOptional()
  @IsObject()
  rafCleaningServices?: Record<string, unknown>;

  /** RAF Open → Main Details (Equipment Detail / Ad-Hoc Equipment) payload. */
  @IsOptional()
  @IsObject()
  rafAdhocDetails?: Record<string, unknown>;
}
