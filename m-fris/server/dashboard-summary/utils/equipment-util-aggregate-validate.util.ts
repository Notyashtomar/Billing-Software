import type { DashboardEquipmentMode } from '../interfaces';
import { equipmentUtilExpectedSlotLabels } from 'src/equipment-manpower/services/equipment-manpower.service';

/**
 * Ensures stored equipment utilization shards use the slab labels for the
 * requested mode. Prevents 4h bucket data from being persisted under `6h`.
 */
export function assertEquipmentUtilAggregateMatchesMode(
  data: Record<string, unknown>,
  mode: DashboardEquipmentMode,
  context?: string,
): void {
  const expected = equipmentUtilExpectedSlotLabels(mode);
  const slotsRaw = data.slots;
  if (!Array.isArray(slotsRaw)) {
    throw new Error(
      `Equipment utilization aggregate missing slots array${context ? ` (${context})` : ''}`,
    );
  }
  if (slotsRaw.length !== expected.length) {
    throw new Error(
      `Equipment utilization slot count mismatch for mode=${mode}: ` +
        `expected ${expected.length}, got ${slotsRaw.length}${context ? ` (${context})` : ''}`,
    );
  }
  const labels = slotsRaw.map((s) =>
    s != null && typeof s === 'object' && !Array.isArray(s)
      ? String((s as { label?: unknown }).label ?? '')
      : '',
  );
  for (let i = 0; i < expected.length; i++) {
    if (labels[i] !== expected[i]) {
      throw new Error(
        `Equipment utilization label mismatch for mode=${mode} at index ${i}: ` +
          `expected "${expected[i]}", got "${labels[i]}"${context ? ` (${context})` : ''}`,
      );
    }
  }
}
