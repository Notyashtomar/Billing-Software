/** Mirrors server RawFlightDataService.isExportedNavValue — for cutover / backfill. */
export function isExportedNavValue(value: unknown): boolean {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'exported' || s === 'y' || s === 'yes';
}

export function readExportedNavFromDaily(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const raw =
    data.exportedNAV ??
    data['Exported NAV'] ??
    data.ExportedNAV ??
    (data.navisionDataExportStatus === 'Y' ? 'Yes' : '');
  return isExportedNavValue(raw);
}
