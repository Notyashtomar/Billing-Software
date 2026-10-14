import type { Schema } from 'mongoose';
import { STATION_CODE_FIELD } from './station.constants';

export interface StationAwarePluginOptions {
  /** Field name to use (defaults to `stationCode`). */
  field?: string;
  /** Whether the field is mandatory (defaults to true). */
  required?: boolean;
  /**
   * Whether the field is immutable after creation (defaults to true).
   * Set false for the rare collection that may be reassigned between stations.
   */
  immutable?: boolean;
  /**
   * Build a compound index `{ stationCode: 1, createdAt: -1 }` when the schema
   * has timestamps (defaults to true).
   */
  withCreatedAtIndex?: boolean;
}

/**
 * Mongoose plugin that makes a schema station-aware.
 *
 * Adds an indexed (and by default mandatory, immutable, uppercased)
 * `stationCode` field plus a single-field index. This is the schema-level
 * defense-in-depth half of the station framework; the service-level
 * `StationScope` helper performs the actual filtering/stamping/ownership.
 */
export function stationAwarePlugin(
  schema: Schema,
  options: StationAwarePluginOptions = {},
): void {
  const field = options.field ?? STATION_CODE_FIELD;
  const required = options.required ?? true;
  const immutable = options.immutable ?? true;
  const withCreatedAtIndex = options.withCreatedAtIndex ?? true;

  schema.add({
    [field]: {
      type: String,
      required,
      immutable,
      trim: true,
      uppercase: true,
    },
  });

  // Single explicit index (avoids the duplicate-index warning that `index:true`
  // plus an explicit `schema.index()` would otherwise produce).
  schema.index({ [field]: 1 });

  const hasTimestamps = Boolean(
    (schema as unknown as { options?: { timestamps?: unknown } }).options
      ?.timestamps,
  );
  if (withCreatedAtIndex && hasTimestamps) {
    schema.index({ [field]: 1, createdAt: -1 });
  }
}
