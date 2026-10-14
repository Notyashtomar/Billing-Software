export const DEFAULT_SERVICE_CODE_BY_SOURCE: Record<string, string> = {
  scheduled_flight: 'Scheduled Flight',
  cleaning: 'Scheduled - Equipment - Cabin Cleaning',
  raf: 'Deep Cleaning',
  maas: 'MAAS',
  ads: 'ADS',
  equipment: 'Scheduled - Equipment - GPU-90KV',
  manpower: 'Scheduled - Manpower - CSA',
  non_scheduled: 'Non Scheduled Flight',
  xxld: 'Cancel Scheduled Flight',
  custom: 'Custom Billing',
};

export function defaultServiceCodeForSource(
  sourceType: string,
  storedServiceCode?: string,
): string {
  const stored = storedServiceCode?.trim();
  if (stored) return stored;
  return DEFAULT_SERVICE_CODE_BY_SOURCE[sourceType] ?? 'Scheduled Flight';
}
