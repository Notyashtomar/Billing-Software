/**
 * Lazy PDF entry points — avoids pulling jspdf/exceljs into the OpenNext Worker
 * until a report export actually runs in the browser.
 */

export type { FlightReportData } from './fhrReportPdf';
export type {
  EquipmentEntry,
  EquipmentSummaryEntry,
} from './equipmentReportPdf';
export type { ManpowerEntryForPdf } from './equipmentManpowerUtils';

export async function fetchFlightReportFromServer(
  ...args: Parameters<(typeof import('./fhrReportPdf'))['fetchFlightReportFromServer']>
) {
  const mod = await import('./fhrReportPdf');
  return mod.fetchFlightReportFromServer(...args);
}

export async function downloadMainReportPdf(
  ...args: Parameters<(typeof import('./fhrReportPdf'))['downloadMainReportPdf']>
) {
  const mod = await import('./fhrReportPdf');
  return mod.downloadMainReportPdf(...args);
}

export async function downloadAndSaveMainReportPdf(
  ...args: Parameters<(typeof import('./fhrReportPdf'))['downloadAndSaveMainReportPdf']>
) {
  const mod = await import('./fhrReportPdf');
  return mod.downloadAndSaveMainReportPdf(...args);
}

export async function downloadFhrReportPdf(
  ...args: Parameters<(typeof import('./fhrReportPdf'))['downloadFhrReportPdf']>
) {
  const mod = await import('./fhrReportPdf');
  return mod.downloadFhrReportPdf(...args);
}

export async function downloadRampDutyAllocationPdf(
  ...args: Parameters<(typeof import('./fhrReportPdf'))['downloadRampDutyAllocationPdf']>
) {
  const mod = await import('./fhrReportPdf');
  return mod.downloadRampDutyAllocationPdf(...args);
}

export async function downloadPlaceholderReportPdf(
  ...args: Parameters<(typeof import('./fhrReportPdf'))['downloadPlaceholderReportPdf']>
) {
  const mod = await import('./fhrReportPdf');
  return mod.downloadPlaceholderReportPdf(...args);
}

export async function sendFlightReportEmail(
  ...args: Parameters<(typeof import('./fhrReportPdf'))['sendFlightReportEmail']>
) {
  const mod = await import('./fhrReportPdf');
  return mod.sendFlightReportEmail(...args);
}

/** Sync helpers — lightweight modules only (never re-export from *ReportPdf.ts). */
export { fhrEquipmentDetailsToEquipmentEntries } from './fhrEquipmentDetailsMapping';
export {
  getDesignationAbbreviation,
  parseEquipmentManpowerFromApi,
} from './equipmentManpowerUtils';

export async function downloadEquipmentReportPdfForFlight(
  ...args: Parameters<(typeof import('./equipmentReportPdf'))['downloadEquipmentReportPdfForFlight']>
) {
  const mod = await import('./equipmentReportPdf');
  return mod.downloadEquipmentReportPdfForFlight(...args);
}

export async function buildEquipmentReportPdfForFlight(
  ...args: Parameters<(typeof import('./equipmentReportPdf'))['buildEquipmentReportPdfForFlight']>
) {
  const mod = await import('./equipmentReportPdf');
  return mod.buildEquipmentReportPdfForFlight(...args);
}

export async function downloadEquipmentManpowerReportPdf(
  ...args: Parameters<(typeof import('./equipmentReportPdf'))['downloadEquipmentManpowerReportPdf']>
) {
  const mod = await import('./equipmentReportPdf');
  return mod.downloadEquipmentManpowerReportPdf(...args);
}

export async function downloadEquipmentSummaryReportPdf(
  ...args: Parameters<(typeof import('./equipmentReportPdf'))['downloadEquipmentSummaryReportPdf']>
) {
  const mod = await import('./equipmentReportPdf');
  return mod.downloadEquipmentSummaryReportPdf(...args);
}

export async function buildScheduledTeamReportPdfFromFhrEmbed(
  ...args: Parameters<(typeof import('./equipmentReportPdf'))['buildScheduledTeamReportPdfFromFhrEmbed']>
) {
  const mod = await import('./equipmentReportPdf');
  return mod.buildScheduledTeamReportPdfFromFhrEmbed(...args);
}
