import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportDashboardDataDto {
  /**
   * JSON rows for bulk import.
   * Expected new format keys per row (example):
   * flightId, airline, operationType, flightCategory, aircraftType,
   * STD_Time, STD_Date, STA_Time, STA_Date, ATD_Time, ATD_Date, ATA_Time, ATA_Date,
   * Planned_STA_Time, Planned_STA_Date, Flight_Status,
   * Delay_Departure, Delay_Arrival, Delay_Code_1, Delay_Reason_1, Delay_Time_1,
   * Delay_Code_2, Delay_Reason_2, Delay_Time_2,
   * Gate_Status_Departure, Gate_Status_Arrival, Body_Type, Remarks,
   * Performance, Month, Record_Status
   */
  @IsOptional()
  @IsArray()
  flights?: Record<string, unknown>[];

  /** Optional plain text paste (first row headers, next rows values). */
  @IsOptional()
  @IsString()
  rawText?: string;

  /** If true (default), delete old dashboard_data before inserting this batch. */
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
