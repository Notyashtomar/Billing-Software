import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';

/**
 * Delhi scheduled equipment codes. BC is Blue Collar, UH is Utility Hand,
 * and WBC / WBCF is Wheel Break Cooling. Other stations keep the shared names.
 */
export function resolveDelhiScheduledEquipmentName(equipmentNo: string): string {
  const raw = String(equipmentNo ?? '').trim();
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (compact === 'bc') return 'Blue Collar';
  if (compact === 'uh') return 'Utility Hand';
  if (compact === 'wbc' || compact === 'wbcf') return 'Wheel Break Cooling';
  return toBillingTrackableFullName(raw);
}
