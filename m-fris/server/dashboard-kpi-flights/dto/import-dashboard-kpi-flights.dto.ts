import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportDashboardKpiFlightsDto {
  /** Rows as JSON objects (same keys as your header row). */
  @IsOptional()
  @IsArray()
  flights?: Record<string, unknown>[];

  /** Paste: first line = tab-separated headers, then one tab-separated row per line. */
  @IsOptional()
  @IsString()
  rawText?: string;

  /** If true (default), clears this collection before insert. Use false to append batches. */
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;

  /**
   * Target station for the import. Ignored for station-scoped users (derived
   * from the authenticated session). Required for cross-station admins so an
   * import/replace can never silently span all stations.
   */
  @IsOptional()
  @IsString()
  stationCode?: string;
}
