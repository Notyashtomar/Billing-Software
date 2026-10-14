// @ts-nocheck
import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import { FlightData, MainDetailsData, normalizeMainDetailsData, nsRawSerialCandidatesForLockFetch } from '@/utils/dataProcessor';
import { equipmentManpowerByFlight, fetchEquipmentManpowerMasterCatalog, fetchScheduledAirlineEquipmentTemplates, getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  buildAbbrDescriptionLookup,
  buildAbbrUnitTypeLookup,
  resolveEquipmentNamesFromCatalog,
} from './gseCatalogLookup';
import {
  buildKnownEquipmentCodeSet,
  collectStaffHeadcountCodes,
  isManpowerEquipmentLine,
  mergeTeamManpowerForPdf,
  splitEquipmentEntriesByKind,
} from './equipmentManpowerClassify';
import {
  type EquipmentEntry,
  fhrEquipmentDetailsToEquipmentEntries,
  mergeEmployeeFieldsFromManpowerEquipment,
} from './fhrEquipmentDetailsMapping';
import { resolveDesignationsOnRows } from './employeeDesignationResolve';
import {
  formatDisplayDate,
  formatTime,
  loadLogoAsBase64,
  formatReportSerialNoLabel,
  formatReportMtow,
  drawPdfRightAlignedBlock,
  type NonScheduledReportHeaderData,
} from './reportPdfUtils';
import { flightNoFromMainDetails } from './flightNoDisplay';
import { enrichFlightForEquipmentReport } from './scheduledEquipmentReportHeader';
import {
  enrichEquipmentStoredRemarksFromScheduleTemplates,
  resolveAircraftBodyForScheduleEquipment,
} from './scheduleEquipmentMerge';
import {
  resolveSignaturesForPdf,
  formatSignedAt,
  placeSignatureImage,
  type SignatureReportKind,
} from './signatures/signaturePdf';
import {
  type ManpowerEntryForPdf,
  getDesignationAbbreviation,
  parseEquipmentManpowerFromApi,
} from './equipmentManpowerUtils';

const fetch = frisFetch;

/** Apply staff-data / user / enriched gateway-staff designations to equipment or manpower rows. */
async function resolveEquipmentDesignationsFromStaff<
  T extends { employeeId?: string; designation?: string },
>(rows: T[]): Promise<T[]> {
  return resolveDesignationsOnRows(rows);
}

/**
 * Resolve reusable representative signatures from the repository and render the
 * two signature boxes (image + name + signed timestamp). Shared by GSE & Team
 * report layouts. Adds a page when there is not enough vertical space.
 */
async function drawReportSignatureSection(
  doc: jsPDF,
  serialKey: string | number | undefined,
  margin: number,
  pageW: number,
  yStart: number,
  report: SignatureReportKind,
): Promise<number> {
  const resolved = await resolveSignaturesForPdf(serialKey, report);
  const sigBoxW = 55;
  const sigBoxH = 20;
  const pageH = doc.internal.pageSize.getHeight();
  let y = yStart;
  if (y + sigBoxH + 18 > pageH - 12) {
    doc.addPage();
    y = 16;
  }

  const ghBoxX = margin + 20;
  const airlineBoxX = pageW - margin - sigBoxW - 20;
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.rect(ghBoxX, y, sigBoxW, sigBoxH);
  doc.rect(airlineBoxX, y, sigBoxW, sigBoxH);
  placeSignatureImage(doc, resolved?.gh.signatureUrl, ghBoxX + 1, y + 1, sigBoxW - 2, sigBoxH - 2);
  placeSignatureImage(
    doc,
    resolved?.airline.signatureUrl,
    airlineBoxX + 1,
    y + 1,
    sigBoxW - 2,
    sigBoxH - 2,
  );

  doc.setFontSize(9);
  doc.setFont('times', 'bold');
  doc.text('GH Representative', ghBoxX + sigBoxW / 2, y + sigBoxH + 6, { align: 'center' });
  doc.text('Airline Representative', airlineBoxX + sigBoxW / 2, y + sigBoxH + 6, {
    align: 'center',
  });

  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  const ghName = (resolved?.gh.name ?? '').trim();
  const airName = (resolved?.airline.name ?? '').trim();
  let ny = y + sigBoxH + 11;
  if (ghName) doc.text(ghName, ghBoxX + sigBoxW / 2, ny, { align: 'center' });
  if (airName) doc.text(airName, airlineBoxX + sigBoxW / 2, ny, { align: 'center' });

  const ghTs = formatSignedAt(resolved?.gh.signedAt);
  const airTs = formatSignedAt(resolved?.airline.signedAt);
  if (ghTs || airTs) {
    ny += 4;
    doc.setFontSize(7);
    if (ghTs) doc.text(`Signed: ${ghTs}`, ghBoxX + sigBoxW / 2, ny, { align: 'center' });
    if (airTs)
      doc.text(`Signed: ${airTs}`, airlineBoxX + sigBoxW / 2, ny, { align: 'center' });
  }

  if (resolved?.isFinalized) {
    doc.setFont('times', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(16, 122, 87);
    doc.text('Digitally Signed', pageW - margin, y - 2, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.setFont('times', 'normal');
  }

  doc.setFontSize(8);
  return ny + 6;
}

/** Equipment Report PDF - generates equipment/manpower and equipment summary reports. */
// ==================== EQUIPMENT/MANPOWER REPORT ====================

export type { EquipmentEntry, ManpowerEntryForPdf };
export { fhrEquipmentDetailsToEquipmentEntries, getDesignationAbbreviation, parseEquipmentManpowerFromApi };

export interface EquipmentSummaryEntry {
  equipmentName: string;
  equipmentId: string;
  employeeCodes: string; // comma-separated list of employee codes
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  remarks: string; // duration (Eng. time)
  /** `remarks` from DB for this row (merged with '; ' when multiple lines share the same slot). */
  remarksText?: string;
}

function calcEquipmentDuration(fromDate: string, fromTime: string, toDate: string, toTime: string): string {
  if (!fromDate || !fromTime || !toDate || !toTime) return '';
  const parseDate = (dateStr: string, timeStr: string): Date | null => {
    if (!dateStr?.trim() || !timeStr?.trim()) return null;
    const dateParts = dateStr.trim().split(/[/-]/);
    if (dateParts.length !== 3) return null;
    let d: number, m: number, y: number;
    if (dateParts[0].length === 4) {
      [y, m, d] = dateParts.map(Number);
    } else {
      [d, m, y] = dateParts.map(Number);
    }
    const [h, min] = timeStr.trim().split(':').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d, h ?? 0, min ?? 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  };
  const from = parseDate(fromDate, fromTime);
  const to = parseDate(toDate, toTime);
  if (!from || !to) return '';
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return '00:00';
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Older equipment-manpower rows stored engagement duration in `remarks`. */
function isLegacyDurationRemarks(raw?: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s || s === '–' || s === '-') return true;
  return /^\d{1,2}:\d{2}$/.test(s);
}

/** Pure decimal values (e.g. 1.5, 0.25) stay hidden on GSE Remarks; text / whole numbers stay. */
function isDecimalNumberRemarks(raw?: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  return /^[+-]?(?:\d+\.\d+|\.\d+)$/.test(s);
}

function normalizeFreeTextRemarks(raw?: string): string {
  const s = String(raw ?? '').trim();
  if (!s || isLegacyDurationRemarks(s) || isDecimalNumberRemarks(s)) return '';
  return s;
}

function fitTextInWidth(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) {
    t = t.slice(0, -1);
  }
  return t.length < text.length ? `${t}…` : t;
}

/** Split cell text to wrap inside a PDF column (jsPDF `splitTextToSize`). */
function wrapPdfCellLines(doc: jsPDF, text: string, colW: number): string[] {
  const raw = String(text ?? '');
  if (!raw) return [''];
  return doc.splitTextToSize(raw, Math.max(4, colW - 3)) as string[];
}

function wrappedDetailRowHeight(
  lineGroups: string[][],
  lineH: number,
  padY: number,
  minH: number,
): number {
  const maxLines = Math.max(1, ...lineGroups.map((lines) => Math.max(1, lines.length)));
  return Math.max(minH, padY + maxLines * lineH + 1);
}

function drawWrappedPdfCellText(
  doc: jsPDF,
  lines: string[],
  x: number,
  y: number,
  padY: number,
  lineH: number,
): void {
  lines.forEach((line, li) => {
    if (!line) return;
    doc.text(line, x + 2, y + padY + (li + 1) * lineH);
  });
}

function drawDesignationCountTable(
  doc: jsPDF,
  margin: number,
  tableW: number,
  startY: number,
  rows: { designation: string; count: number }[],
  rowH: number,
): number {
  const titleColW = 24;
  const minColW = 10;
  const maxColW = 24;
  const pad = 4;

  if (rows.length === 0) {
    doc.rect(margin, startY, tableW, rowH);
    doc.text('No designation data', margin + tableW / 2, startY + 5, { align: 'center' });
    return startY + rowH;
  }

  doc.setFontSize(7);
  const colWidths = rows.map((row) => {
    const w = doc.getTextWidth(row.designation) + pad;
    return Math.min(maxColW, Math.max(minColW, w));
  });

  let totalDataW = colWidths.reduce((a, b) => a + b, 0);
  const maxDataW = tableW - titleColW;
  if (totalDataW > maxDataW) {
    const scale = maxDataW / totalDataW;
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.max(minColW, colWidths[i] * scale);
    }
    totalDataW = colWidths.reduce((a, b) => a + b, 0);
  }

  let y = startY;
  let x = margin;
  doc.setFont('times', 'bold');
  doc.rect(x, y, titleColW, rowH);
  doc.text('Designation', x + titleColW / 2, y + 5, { align: 'center' });
  x += titleColW;
  for (let i = 0; i < rows.length; i++) {
    const w = colWidths[i];
    const label = fitTextInWidth(doc, rows[i].designation, w - 2);
    doc.rect(x, y, w, rowH);
    doc.text(label, x + w / 2, y + 5, { align: 'center' });
    x += w;
  }
  y += rowH;

  x = margin;
  doc.setFont('times', 'bold');
  doc.rect(x, y, titleColW, rowH);
  doc.text('Count', x + titleColW / 2, y + 5, { align: 'center' });
  x += titleColW;
  doc.setFont('times', 'normal');
  for (let i = 0; i < rows.length; i++) {
    const w = colWidths[i];
    doc.rect(x, y, w, rowH);
    doc.text(String(rows[i].count), x + w / 2, y + 5, { align: 'center' });
    x += w;
  }
  y += rowH;

  return y;
}

function formatDesignationWithPlace(designation?: string, place?: 'terminal' | 'ramp' | 'gse'): string {
  const label = cleanDesignationLabel(designation);
  const placeAbbrev = place === 'ramp' ? 'UH' : place === 'terminal' ? 'T' : place === 'gse' ? 'GSE' : '';
  if (label && placeAbbrev) return `${label} - ${placeAbbrev}`;
  return label || placeAbbrev || '-';
}

/** Strip mojibake (ΓÇô) / unicode dashes so PDF fonts render cleanly. */
function cleanDesignationLabel(raw?: string): string {
  let s = String(raw ?? '')
    .replace(/ΓÇô/g, '')
    .replace(/\u2013|\u2014|\u2212/g, '-')
    .trim();
  if (!s || s === '-' || /^operator$/i.test(s)) return '';
  return s;
}

/** First letter of each word capital, rest lowercase. */
function toTitleCase(s: string): string {
  if (!s?.trim()) return s ?? '';
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Build EquipmentSummaryEntry[] from EquipmentEntry[] (one row per entry; duplicates preserved). */
function buildSummaryFromEquipmentEntries(entries: EquipmentEntry[]): EquipmentSummaryEntry[] {
  const key = (e: EquipmentEntry, idx: number) =>
    `${(e as { id?: string }).id ?? idx}|${e.equipmentName}|${e.equipmentId || ''}|${e.fromDate}|${e.fromTime}|${e.toDate}|${e.toTime}`;
  const map = new Map<
    string,
    { entry: EquipmentEntry; employeeIds: string[]; dbRemarks: Set<string> }
  >();
  entries.forEach((e, idx) => {
    const k = key(e, idx);
    const r = normalizeFreeTextRemarks(e.storedRemarks);
    const existing = map.get(k);
    if (existing) {
      if (e.employeeId && !existing.employeeIds.includes(e.employeeId)) {
        existing.employeeIds.push(e.employeeId);
      }
      if (r) existing.dbRemarks.add(r);
    } else {
      const dbRemarks = new Set<string>();
      if (r) dbRemarks.add(r);
      map.set(k, {
        entry: e,
        employeeIds: e.employeeId ? [e.employeeId] : [],
        dbRemarks,
      });
    }
  });
  return Array.from(map.values()).map(({ entry, employeeIds, dbRemarks }) => ({
    equipmentName: entry.equipmentName,
    equipmentId: entry.equipmentId || '',
    employeeCodes: employeeIds.join(', ') || '-',
    fromDate: entry.fromDate,
    fromTime: entry.fromTime,
    toDate: entry.toDate,
    toTime: entry.toTime,
    remarks:
      (entry.engagedTime ?? '').trim() ||
      calcEquipmentDuration(
        entry.fromDate,
        entry.fromTime,
        entry.toDate,
        entry.toTime,
      ),
    remarksText: Array.from(dbRemarks).join('; '),
  }));
}

function ensureSummaryPdfSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  margin: number,
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed <= pageH - margin) return y;
  doc.addPage();
  return margin;
}

/**
 * Reserve vertical space for one detail row. When the row would fall past the bottom
 * margin a page is added and `drawHeader` repeats the column headings there, so long
 * flights (Chennai July averages ~20 equipment/manpower lines) stay readable instead of
 * being drawn off the page.
 */
function ensureDetailRowSpace(
  doc: jsPDF,
  y: number,
  rowH: number,
  margin: number,
  drawHeader: (atY: number) => number,
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + rowH <= pageH - margin) return y;
  doc.addPage();
  return drawHeader(margin);
}

/** Section caption above a detail table. */
function drawDetailSectionCaption(
  doc: jsPDF,
  label: string,
  margin: number,
  y: number,
): number {
  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.text(label, margin, y + 3.5);
  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  return y + 5.5;
}

/** Draw one GSE or manpower summary table; returns y after the table. */
function drawEquipmentSummaryTable(
  doc: jsPDF,
  margin: number,
  tableW: number,
  startY: number,
  rows: EquipmentSummaryEntry[],
  nameColumnLabel: string,
  emptyMessage: string,
): number {
  const eqRowH = 7;
  const sumCol1W = 48;
  const sumCol2W = 20;
  const sumCol3W = 16;
  const sumCol4W = 20;
  const sumCol5W = 16;
  const sumCol6W = 14;
  const sumCol7W =
    tableW - (sumCol1W + sumCol2W + sumCol3W + sumCol4W + sumCol5W + sumCol6W);

  let y = ensureSummaryPdfSpace(doc, startY, eqRowH, margin);
  let x = margin;
  doc.setLineWidth(0.2);
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.rect(x, y, sumCol1W, eqRowH);
  doc.text(nameColumnLabel, x + 2, y + 5);
  x += sumCol1W;
  doc.rect(x, y, sumCol2W, eqRowH);
  doc.text('From Date', x + 2, y + 5);
  x += sumCol2W;
  doc.rect(x, y, sumCol3W, eqRowH);
  doc.text('From Time', x + 2, y + 5);
  x += sumCol3W;
  doc.rect(x, y, sumCol4W, eqRowH);
  doc.text('To Date', x + 2, y + 5);
  x += sumCol4W;
  doc.rect(x, y, sumCol5W, eqRowH);
  doc.text('To Time', x + 2, y + 5);
  x += sumCol5W;
  doc.rect(x, y, sumCol6W, eqRowH);
  doc.text('Eng. time', x + 2, y + 5);
  x += sumCol6W;
  doc.rect(x, y, sumCol7W, eqRowH);
  doc.text('Remarks', x + 2, y + 5);
  y += eqRowH;

  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  if (rows.length === 0) {
    y = ensureSummaryPdfSpace(doc, y, eqRowH, margin);
    doc.rect(margin, y, tableW, eqRowH);
    doc.text(emptyMessage, margin + tableW / 2, y + 5, { align: 'center' });
    y += eqRowH;
    return y;
  }

  for (const entry of rows) {
    const wrapLineH = 3.2;
    const wrapPadY = 2.2;
    const nameLines = wrapPdfCellLines(doc, entry.equipmentName || '', sumCol1W);
    const remarksLines = wrapPdfCellLines(
      doc,
      normalizeFreeTextRemarks(entry.remarksText) || '',
      sumCol7W,
    );
    const rowH = wrappedDetailRowHeight(
      [nameLines, remarksLines],
      wrapLineH,
      wrapPadY,
      eqRowH,
    );
    y = ensureSummaryPdfSpace(doc, y, rowH, margin);
    x = margin;
    const Text = y + 5;
    doc.rect(x, y, sumCol1W, rowH);
    drawWrappedPdfCellText(doc, nameLines, x, y, wrapPadY, wrapLineH);
    x += sumCol1W;
    doc.rect(x, y, sumCol2W, rowH);
    doc.text(formatDisplayDate(entry.fromDate), x + 2, Text);
    x += sumCol2W;
    doc.rect(x, y, sumCol3W, rowH);
    doc.text(formatTime(entry.fromTime), x + 2, Text);
    x += sumCol3W;
    doc.rect(x, y, sumCol4W, rowH);
    doc.text(formatDisplayDate(entry.toDate), x + 2, Text);
    x += sumCol4W;
    doc.rect(x, y, sumCol5W, rowH);
    doc.text(formatTime(entry.toTime), x + 2, Text);
    x += sumCol5W;
    doc.rect(x, y, sumCol6W, rowH);
    doc.setFontSize(7);
    doc.text(entry.remarks || '', x + 2, Text);
    doc.setFontSize(8);
    x += sumCol6W;
    doc.rect(x, y, sumCol7W, rowH);
    drawWrappedPdfCellText(doc, remarksLines, x, y, wrapPadY, wrapLineH);
    y += rowH;
  }

  return y;
}

function splitFhrDetailsIntoSummaryRows(
  details: unknown[],
  abbrLookup: Map<string, string>,
  unitTypeLookup: Map<string, string>,
  equipmentCodes: Set<string>,
): { equipment: EquipmentSummaryEntry[]; manpower: EquipmentSummaryEntry[] } {
  const mapped = fhrEquipmentDetailsToEquipmentEntries(details, abbrLookup);
  const equipmentEntries: EquipmentEntry[] = [];
  const manpowerEntries: EquipmentEntry[] = [];
  const staffCodes = collectStaffHeadcountCodes(mapped, equipmentCodes);
  mapped.forEach((entry) => {
    if (isManpowerEquipmentLine(entry, unitTypeLookup, equipmentCodes, staffCodes)) {
      manpowerEntries.push(entry);
    } else {
      equipmentEntries.push(entry);
    }
  });
  return {
    equipment: buildSummaryFromEquipmentEntries(equipmentEntries),
    manpower: buildSummaryFromEquipmentEntries(manpowerEntries),
  };
}

/**
 * Build equipment summary PDF (same resolution rules as download) without saving.
 * Returns null when no equipment / manpower source is found.
 */
export async function buildEquipmentReportPdfForFlight(
  flight: FlightData,
  mainDetails?: MainDetailsData | null,
  _loggedInUserName?: string,
  nonScheduledHeader?: NonScheduledReportHeaderData,
): Promise<jsPDF | null> {
  void _loggedInUserName;
  const serialCandidates = nsRawSerialCandidatesForLockFetch(flight);
  if (serialCandidates.length === 0 && flight.slNo != null) {
    serialCandidates.push(String(flight.slNo));
  }
  const expanded: string[] = [];
  for (const r of serialCandidates) {
    const s = String(r ?? '').trim();
    if (!s) continue;
    expanded.push(s, s.replace(/^FL-/i, ''), s.replace(/[^0-9]/g, ''));
  }
  const trySerials = Array.from(new Set(expanded.filter(Boolean)));
  const flightForPdf = await enrichFlightForEquipmentReport(
    flight,
    mainDetails,
    trySerials,
  );

  const base = getApiBase().replace(/\/$/, '');

  const catalogItems = await fetchEquipmentManpowerMasterCatalog();
  const abbrLookup = buildAbbrDescriptionLookup(catalogItems);
  const unitTypeLookup = buildAbbrUnitTypeLookup(catalogItems);
  const equipmentCodes = buildKnownEquipmentCodeSet(catalogItems);

  for (const serial of trySerials) {
    const fhrRes = await fetch(
      `${base}/fhr-collection/flight/${encodeURIComponent(serial)}`,
    );
    if (!fhrRes.ok) continue;
    try {
      const fhrDoc = (await fhrRes.json()) as {
        equipmentDetails?: unknown[];
        equipmentManpower?: { entries?: unknown[] } | null;
        mainDetails?: Record<string, unknown> | null;
      };
      const details = fhrDoc?.equipmentDetails;
      if (Array.isArray(details) && details.length > 0) {
        const embedRaw = fhrDoc?.equipmentManpower?.entries;
        const fromEmbed = parseEquipmentManpowerFromApi(
          (Array.isArray(embedRaw) ? embedRaw : []) as {
            name?: string;
            entryType?: string;
            equipmentName?: string;
            equipmentSerialNo?: string;
            employeeName?: string;
            employeeId?: string;
            designation?: string;
            place?: string;
            fromDate?: string;
            fromTime?: string;
            toDate?: string;
            toTime?: string;
            remarks?: string;
          }[],
        );
        let formEquipment = fromEmbed.equipment;
        if (formEquipment.length === 0) {
          const mpRes = await fetch(equipmentManpowerByFlight(serial).get());
          if (mpRes.ok) {
            const text = await mpRes.text();
            if (text.trim()) {
              try {
                const parsed = JSON.parse(text) as { entries?: unknown[] };
                formEquipment = parseEquipmentManpowerFromApi(
                  (Array.isArray(parsed?.entries) ? parsed.entries : []) as {
                    name?: string;
                    entryType?: string;
                    equipmentName?: string;
                    equipmentSerialNo?: string;
                    employeeName?: string;
                    employeeId?: string;
                    designation?: string;
                    place?: string;
                    fromDate?: string;
                    fromTime?: string;
                    toDate?: string;
                    toTime?: string;
                    remarks?: string;
                  }[],
                ).equipment;
              } catch {
                /* keep empty form equipment */
              }
            }
          }
        }
        let mergedDetails = mergeEmployeeFieldsFromManpowerEquipment(
          fhrEquipmentDetailsToEquipmentEntries(details, abbrLookup),
          formEquipment,
        );
        if (mergedDetails.some((e) => !String(e.storedRemarks ?? '').trim())) {
          try {
            const md =
              fhrDoc?.mainDetails && typeof fhrDoc.mainDetails === 'object'
                ? fhrDoc.mainDetails
                : {};
            const pick = (...keys: string[]) => {
              for (const k of keys) {
                const v = String(md[k] ?? '').trim();
                if (v) return v;
              }
              return '';
            };
            const ataDate = pick('ataDate', 'ATADate');
            const ataTime = pick('ataTime', 'ATATime');
            const atdDate = pick('atdDate', 'ATDDate');
            const atdTime = pick('atdTime', 'ATDTime');
            const staDate = pick('staDate', 'STADate');
            const stdDate = pick('stdDate', 'STDDate');
            const defaultDate = stdDate || staDate || ataDate || atdDate || '';
            const airlineCode = pick('airlineCode', 'Arline_Code');
            const airlineName = pick('airlineName', 'Airline');
            if (airlineCode || airlineName) {
              const rules = await fetchScheduledAirlineEquipmentTemplates({
                airlineCode: airlineCode || undefined,
                airlineName: airlineName || undefined,
                aircraftBody: resolveAircraftBodyForScheduleEquipment(
                  normalizeMainDetailsData(md),
                ),
                splitOperation: md.ifOperationSplit === true,
                ataDate: ataDate || staDate,
                ataTime,
                atdDate: atdDate || stdDate,
                atdTime,
                defaultDate,
              });
              mergedDetails = enrichEquipmentStoredRemarksFromScheduleTemplates(
                mergedDetails,
                rules,
              );
            }
          } catch {
            /* keep mergedDetails */
          }
        }
        // Re-split after overlay so remarks/staff fields from the form land in summary.
        const equipmentEntries: EquipmentEntry[] = [];
        const manpowerEntries: EquipmentEntry[] = [];
        const staffCodes = collectStaffHeadcountCodes(mergedDetails, equipmentCodes);
        mergedDetails.forEach((entry) => {
          if (isManpowerEquipmentLine(entry, unitTypeLookup, equipmentCodes, staffCodes)) {
            manpowerEntries.push(entry);
          } else {
            equipmentEntries.push(entry);
          }
        });
        return await buildEquipmentSummaryReportPdf(
          flightForPdf,
          buildSummaryFromEquipmentEntries(equipmentEntries),
          mainDetails,
          {
            manpowerEntries: buildSummaryFromEquipmentEntries(manpowerEntries),
            nonScheduledHeader,
          },
        );
      }
    } catch {
      continue;
    }
  }

  let doc: { entries?: unknown[] } | null = null;
  for (const serial of trySerials) {
    const res = await fetch(equipmentManpowerByFlight(serial).get());
    if (!res.ok) continue;
    const text = await res.text();
    if (!text.trim()) continue;
    try {
      const parsed = JSON.parse(text) as { entries?: unknown[] };
      const ent = parsed?.entries;
      if (Array.isArray(ent) && ent.length > 0) {
        doc = parsed;
        break;
      }
      if (parsed && !doc) doc = parsed;
    } catch {
      continue;
    }
  }
  const rawEntries =
    (doc?.entries ?? []) as {
      name?: string;
      fromDate?: string;
      fromTime?: string;
      toDate?: string;
      toTime?: string;
      remarks?: string;
    }[];
  const { equipment } = parseEquipmentManpowerFromApi(rawEntries);
  const resolvedEquipment = resolveEquipmentNamesFromCatalog(equipment, abbrLookup);
  const summaryEntries = buildSummaryFromEquipmentEntries(resolvedEquipment);
  if (summaryEntries.length === 0) return null;
  return await buildEquipmentSummaryReportPdf(
    flightForPdf,
    summaryEntries,
    mainDetails,
    { manpowerEntries: [], nonScheduledHeader },
  );
}

/** Fetch equipment/manpower for flight and download Equipment Report as a separate PDF (summary format). */
export async function downloadEquipmentReportPdfForFlight(
  flight: FlightData,
  mainDetails?: MainDetailsData | null,
  loggedInUserName?: string,
  nonScheduledHeader?: NonScheduledReportHeaderData,
): Promise<void> {
  const doc = await buildEquipmentReportPdfForFlight(
    flight,
    mainDetails,
    loggedInUserName,
    nonScheduledHeader,
  );
  if (doc) {
    doc.save(`Equipment-Summary-Report-${flight.flightNo}-${flight.slNo}.pdf`);
  }
}

export async function buildEquipmentManpowerDetailReportPdf(
  flight: FlightData,
  entries: EquipmentEntry[],
  mainDetails?: MainDetailsData | null,
  verifiedBy?: string,
  manpowerEntries?: ManpowerEntryForPdf[],
  nonScheduledHeader?: NonScheduledReportHeaderData,
): Promise<jsPDF> {
  void verifiedBy;
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const tableW = pageW - 2 * margin;
  let y = 12;

  const logoBase64 = await loadLogoAsBase64();
  const airlineName = mainDetails?.airlineName || flight.airline || '';
  const flightNo = flightNoFromMainDetails(mainDetails, flight.flightNo || '');
  const aircraftType = mainDetails?.aircraftType || flight.aircraft || '';
  const serialNo = flight.slNo;
  const staDate = formatDisplayDate(flight.staDate || '');
  const stdDate = formatDisplayDate(flight.stdDate || '');
  const staTime = formatTime(flight.staTime || '');
  const stdTime = formatTime(flight.stdTime || '');
  const ataDate = formatDisplayDate(mainDetails?.ataDate || '');
  const atdDate = formatDisplayDate(mainDetails?.atdDate || '');
  const ataTime = formatTime(mainDetails?.ataTime || '');
  const atdTime = formatTime(mainDetails?.atdTime || '');

  // Header: row 1 = logo (left), report identity (right)
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', margin, y - 4, 64, 12); } catch {}
  }
  if (nonScheduledHeader) {
    const rightX = pageW - margin;
    const rightBlockMaxW = Math.max(40, pageW - 2 * margin - 68);
    const operation = String(nonScheduledHeader.operation || 'Turnaround').trim();
    const handlingType = String(nonScheduledHeader.handlingType || 'Non-Scheduled').trim();
    const headerLines = [
      formatReportSerialNoLabel(serialNo),
      `Performa No : ${String(nonScheduledHeader.challanNo || '—').trim()}`,
      `Booking No : ${String(nonScheduledHeader.bookingNo || '—').trim()}`,
      `${operation}   ${handlingType}`,
      `MTOW : ${formatReportMtow(nonScheduledHeader.mtow ?? mainDetails?.mtow)}`,
    ];
    doc.setFont('times', 'normal');
    const blockH = drawPdfRightAlignedBlock(doc, headerLines, rightX, y - 2, rightBlockMaxW, {
      fontSize: 9,
      minFontSize: 6,
      lineHeight: 4,
    });
    y += Math.max(14, blockH + 2);
  } else {
    doc.setFontSize(10);
    doc.setFont('times', 'normal');
    doc.text(airlineName, pageW - margin, y + 2, { align: 'right' });
    doc.setFontSize(8);
    doc.text(formatReportSerialNoLabel(serialNo), pageW - margin, y + 8, { align: 'right' });
    y += 14;
  }

  // Row 2 = title
  doc.setFontSize(12);
  doc.setFont('times', 'bold');
  const title = 'Summary of Equipment and Manpower Used';
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, pageW / 2, y + 2, { align: 'center' });
  doc.setLineWidth(0.5);
  doc.line(pageW / 2 - titleWidth / 2, y + 4, pageW / 2 + titleWidth / 2, y + 4);

  y += 14;

  // Flight details block - outer border only, no inner partition lines
  const rowH = 8;
  const colWidths = [20, 22, 18, 22, 18, 12, 18, 22, 18, tableW - 170];
  doc.setLineWidth(0.2);
  doc.rect(margin, y, tableW, rowH * 2);
  doc.setFontSize(8);
  let x = margin;
  doc.setFont('times', 'bold');
  doc.text('Flight No :', x + 2, y + 5.5); x += colWidths[0];
  doc.setFont('times', 'normal'); doc.text(flightNo, x + 2, y + 5.5); x += colWidths[1];
  doc.setFont('times', 'bold'); doc.text('STD Date :', x + 2, y + 5.5); x += colWidths[2];
  doc.setFont('times', 'normal'); doc.text(stdDate, x + 2, y + 5.5); x += colWidths[3];
  doc.setFont('times', 'bold'); doc.text('STD Time :', x + 2, y + 5.5); x += colWidths[4];
  doc.setFont('times', 'normal'); doc.text(stdTime, x + 2, y + 5.5); x += colWidths[5];
  doc.setFont('times', 'bold'); doc.text('ATD Date :', x + 2, y + 5.5); x += colWidths[6];
  doc.setFont('times', 'normal'); doc.text(atdDate, x + 2, y + 5.5); x += colWidths[7];
  doc.setFont('times', 'bold'); doc.text('ATD Time:', x + 2, y + 5.5); x += colWidths[8];
  doc.setFont('times', 'normal'); doc.text(atdTime, x + 2, y + 5.5);
  y += rowH;
  x = margin;
  doc.setFont('times', 'bold');
  doc.text('Aircraft Type:', x + 2, y + 5.5); x += colWidths[0];
  doc.setFont('times', 'normal'); doc.text(aircraftType, x + 2, y + 5.5); x += colWidths[1];
  doc.setFont('times', 'bold'); doc.text('STA Date :', x + 2, y + 5.5); x += colWidths[2];
  doc.setFont('times', 'normal'); doc.text(staDate, x + 2, y + 5.5); x += colWidths[3];
  doc.setFont('times', 'bold'); doc.text('STA Time :', x + 2, y + 5.5); x += colWidths[4];
  doc.setFont('times', 'normal'); doc.text(staTime, x + 2, y + 5.5); x += colWidths[5];
  doc.setFont('times', 'bold'); doc.text('ATA Date :', x + 2, y + 5.5); x += colWidths[6];
  doc.setFont('times', 'normal'); doc.text(ataDate, x + 2, y + 5.5); x += colWidths[7];
  doc.setFont('times', 'bold'); doc.text('ATA Time:', x + 2, y + 5.5); x += colWidths[8];
  doc.setFont('times', 'normal'); doc.text(ataTime, x + 2, y + 5.5);
  y += rowH + 4;

  // Table 1 - Ground support equipment. Manpower is never listed here; it gets its
  // own table below so the two resource kinds stay separable.
  doc.setLineWidth(0.2);
  const eqRowH = 7;
  const eqCol1W = 31;  // GSE NAME
  const eqCol2W = 20;  // GSE NO.
  const eqCol3W = 20;  // EMPLOYEE ID
  const eqCol4W = 26;  // Employee name
  const eqCol5W = 19;  // Designation
  const eqCol6W = 17;  // From Date
  const eqCol7W = 14;  // From Time
  const eqCol8W = 17;  // To Date
  const eqCol9W = 14;  // To Time
  const eqCol10W = 13;  // Engaging time (decreased)
  const eqTableW =
    eqCol1W + eqCol2W + eqCol3W + eqCol4W + eqCol5W + eqCol6W + eqCol7W + eqCol8W +
    eqCol9W + eqCol10W;

  const drawEquipmentHeader = (atY: number): number => {
    let hx = margin;
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.rect(hx, atY, eqCol1W, eqRowH); doc.text('GSE NAME', hx + 2, atY + 5, { align: 'left' }); hx += eqCol1W;
    doc.rect(hx, atY, eqCol2W, eqRowH); doc.text('GSE NO.', hx + 2, atY + 5, { align: 'left' }); hx += eqCol2W;
    doc.rect(hx, atY, eqCol3W, eqRowH); doc.text('Employee ID', hx + 2, atY + 5, { align: 'left' }); hx += eqCol3W;
    doc.rect(hx, atY, eqCol4W, eqRowH); doc.text('Employee name', hx + 2, atY + 5, { align: 'left' }); hx += eqCol4W;
    doc.rect(hx, atY, eqCol5W, eqRowH); doc.text('Designation', hx + 2, atY + 5, { align: 'left' }); hx += eqCol5W;
    doc.rect(hx, atY, eqCol6W, eqRowH); doc.text('From', hx + 2, atY + 5, { align: 'left' }); hx += eqCol6W;
    doc.rect(hx, atY, eqCol7W, eqRowH); doc.text('From', hx + 2, atY + 5, { align: 'left' }); hx += eqCol7W;
    doc.rect(hx, atY, eqCol8W, eqRowH); doc.text('To', hx + 2, atY + 5, { align: 'left' }); hx += eqCol8W;
    doc.rect(hx, atY, eqCol9W, eqRowH); doc.text('To', hx + 2, atY + 5, { align: 'left' }); hx += eqCol9W;
    doc.rect(hx, atY, eqCol10W, eqRowH); doc.text('Eng. time', hx + 2, atY + 5, { align: 'left' });
    doc.setFont('times', 'normal');
    return atY + eqRowH;
  };

  y = ensureSummaryPdfSpace(doc, y, eqRowH * 3, margin);
  y = drawDetailSectionCaption(doc, 'Ground Support Equipment (GSE)', margin, y);
  y = drawEquipmentHeader(y);

  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  if (entries.length === 0) {
    doc.rect(margin, y, eqTableW, eqRowH);
    doc.text('No GSE entries', margin + 2, y + 5);
    y += eqRowH;
  }
  const gseNameLineH = 3.2;
  const gseNamePadY = 2.2;
  for (const entry of entries) {
    const gseNameLines = doc.splitTextToSize(
      entry.equipmentName || '',
      Math.max(4, eqCol1W - 3),
    ) as string[];
    const rowH = Math.max(eqRowH, gseNamePadY + gseNameLines.length * gseNameLineH + 1);
    y = ensureDetailRowSpace(doc, y, rowH, margin, drawEquipmentHeader);
    x = margin;
    const duration =
      (entry.engagedTime ?? '').trim() ||
      calcEquipmentDuration(entry.fromDate, entry.fromTime, entry.toDate, entry.toTime);
    const Text = y + 5;
    doc.rect(x, y, eqCol1W, rowH);
    gseNameLines.forEach((line, li) => {
      doc.text(line, x + 2, y + gseNamePadY + (li + 1) * gseNameLineH);
    });
    x += eqCol1W;
    doc.rect(x, y, eqCol2W, rowH); doc.text(entry.equipmentId || '', x + 2, Text); x += eqCol2W;
    doc.rect(x, y, eqCol3W, rowH); doc.text(entry.employeeId || '', x + 2, Text); x += eqCol3W;
    doc.rect(x, y, eqCol4W, rowH); doc.text(toTitleCase(entry.employeeName || ''), x + 2, Text); x += eqCol4W;
    doc.rect(x, y, eqCol5W, rowH); doc.text(toTitleCase(cleanDesignationLabel(entry.designation) || '-'), x + 2, Text); x += eqCol5W;
    doc.rect(x, y, eqCol6W, rowH); doc.text(formatDisplayDate(entry.fromDate), x + 2, Text); x += eqCol6W;
    doc.rect(x, y, eqCol7W, rowH); doc.text(formatTime(entry.fromTime), x + 2, Text); x += eqCol7W;
    doc.rect(x, y, eqCol8W, rowH); doc.text(formatDisplayDate(entry.toDate), x + 2, Text); x += eqCol8W;
    doc.rect(x, y, eqCol9W, rowH); doc.text(formatTime(entry.toTime), x + 2, Text); x += eqCol9W;
    doc.rect(x, y, eqCol10W, rowH); doc.setFontSize(7); doc.text(duration, x + 2, Text); doc.setFontSize(8);
    y += rowH;
  }

  y += 8;

  // Table 2 - Manpower
  const mpCol1W = 30;  // Employee name
  const mpCol2W = 20;  // Employee ID
  const mpCol3W = 40;  // Designation (with place T/UH or headcount note)
  const mpColStaffW = 13;  // Staff on the line
  const mpCol4W = 17;  // From Date
  const mpCol5W = 13;  // From Time
  const mpCol6W = 17;  // To Date
  const mpCol7W = 13;  // To Time
  const mpCol8W = 14;  // Engaging time (decreased)
  const mpTableW =
    mpCol1W + mpCol2W + mpCol3W + mpColStaffW + mpCol4W + mpCol5W + mpCol6W +
    mpCol7W + mpCol8W;

  const drawManpowerHeader = (atY: number): number => {
    let hx = margin;
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.rect(hx, atY, mpCol1W, eqRowH); doc.text('Employee name', hx + 2, atY + 5); hx += mpCol1W;
    doc.rect(hx, atY, mpCol2W, eqRowH); doc.text('Employee ID', hx + 2, atY + 5); hx += mpCol2W;
    doc.rect(hx, atY, mpCol3W, eqRowH); doc.text('Designation', hx + 2, atY + 5); hx += mpCol3W;
    doc.rect(hx, atY, mpColStaffW, eqRowH); doc.text('Staff', hx + 2, atY + 5); hx += mpColStaffW;
    doc.rect(hx, atY, mpCol4W, eqRowH); doc.text('From', hx + 2, atY + 5); hx += mpCol4W;
    doc.rect(hx, atY, mpCol5W, eqRowH); doc.text('From', hx + 2, atY + 5); hx += mpCol5W;
    doc.rect(hx, atY, mpCol6W, eqRowH); doc.text('To', hx + 2, atY + 5); hx += mpCol6W;
    doc.rect(hx, atY, mpCol7W, eqRowH); doc.text('To', hx + 2, atY + 5); hx += mpCol7W;
    doc.rect(hx, atY, mpCol8W, eqRowH); doc.text('Eng. time', hx + 2, atY + 5);
    doc.setFont('times', 'normal');
    return atY + eqRowH;
  };

  const manpowerList = manpowerEntries ?? [];
  y = ensureSummaryPdfSpace(doc, y, eqRowH * 3, margin);
  y = drawDetailSectionCaption(doc, 'Manpower', margin, y);
  y = drawManpowerHeader(y);

  doc.setFont('times', 'normal');
  if (manpowerList.length === 0) {
    doc.rect(margin, y, mpTableW, eqRowH);
    doc.text('No manpower entries', margin + 2, y + 5);
    y += eqRowH;
  } else {
    const mpWrapLineH = 3.2;
    const mpWrapPadY = 2.2;
    for (const entry of manpowerList) {
      const employeeName = String(entry.employeeName ?? '').trim();
      // Spreadsheet-seeded rows record a role plus a headcount instead of a named person.
      const isHeadcountRow = !employeeName && entry.headcount != null;
      const duration =
        (entry.engagedTime ?? '').trim() ||
        calcEquipmentDuration(entry.fromDate, entry.fromTime, entry.toDate, entry.toTime);
      const designationLabel = isHeadcountRow
        ? [cleanDesignationLabel(entry.designation) || '-', entry.note ? `(${entry.note})` : '']
            .filter(Boolean)
            .join(' ')
        : formatDesignationWithPlace(entry.designation, entry.place);
      const staffLabel = entry.headcount != null ? String(entry.headcount) : employeeName ? '1' : '';
      const nameLines = wrapPdfCellLines(
        doc,
        employeeName ? toTitleCase(employeeName) : '-',
        mpCol1W,
      );
      const idLines = wrapPdfCellLines(doc, entry.employeeId || '', mpCol2W);
      doc.setFontSize(7);
      const designationLines = wrapPdfCellLines(doc, designationLabel, mpCol3W);
      doc.setFontSize(8);
      const rowH = wrappedDetailRowHeight(
        [nameLines, idLines, designationLines],
        mpWrapLineH,
        mpWrapPadY,
        eqRowH,
      );
      y = ensureDetailRowSpace(doc, y, rowH, margin, drawManpowerHeader);
      x = margin;
      const Text = y + 5;
      doc.rect(x, y, mpCol1W, rowH);
      drawWrappedPdfCellText(doc, nameLines, x, y, mpWrapPadY, mpWrapLineH);
      x += mpCol1W;
      doc.rect(x, y, mpCol2W, rowH);
      drawWrappedPdfCellText(doc, idLines, x, y, mpWrapPadY, mpWrapLineH);
      x += mpCol2W;
      doc.rect(x, y, mpCol3W, rowH);
      doc.setFontSize(7);
      drawWrappedPdfCellText(doc, designationLines, x, y, mpWrapPadY, mpWrapLineH);
      doc.setFontSize(8);
      x += mpCol3W;
      doc.rect(x, y, mpColStaffW, rowH); doc.text(staffLabel, x + 2, Text); x += mpColStaffW;
      doc.rect(x, y, mpCol4W, rowH); doc.text(formatDisplayDate(entry.fromDate), x + 2, Text); x += mpCol4W;
      doc.rect(x, y, mpCol5W, rowH); doc.text(formatTime(entry.fromTime), x + 2, Text); x += mpCol5W;
      doc.rect(x, y, mpCol6W, rowH); doc.text(formatDisplayDate(entry.toDate), x + 2, Text); x += mpCol6W;
      doc.rect(x, y, mpCol7W, rowH); doc.text(formatTime(entry.toTime), x + 2, Text); x += mpCol7W;
      doc.rect(x, y, mpCol8W, rowH); doc.setFontSize(7); doc.text(duration, x + 2, Text); doc.setFontSize(8);
      y += rowH;
    }
  }

  y += 8;

  // Table 3 - Designation Abbreviation count (from equipment + manpower only; match page logic)
  const countByDesignation = new Map<string, number>();
  const addDesignation = (designation: string | undefined, count = 1) => {
    const label = cleanDesignationLabel(designation);
    if (!label) return;
    countByDesignation.set(label, (countByDesignation.get(label) ?? 0) + count);
  };
  (entries || []).forEach((e) => addDesignation(e.designation));
  manpowerList.forEach((e) => addDesignation(e.designation, e.headcount ?? 1));
  const designationCountRows = Array.from(countByDesignation.entries())
    .map(([designation, count]) => ({ designation, count }))
    .sort((a, b) => a.designation.localeCompare(b.designation));

  doc.setLineWidth(0.2);
  y = ensureSummaryPdfSpace(doc, y, eqRowH * 2, margin);
  y = drawDesignationCountTable(
    doc,
    margin,
    tableW,
    y,
    designationCountRows,
    eqRowH,
  );

  y += 10;

  // Reusable representative signatures (GH + Airline) resolved from repository.
  y = await drawReportSignatureSection(doc, flight.slNo, margin, pageW, y, 'team');

  // Footer
  const now = new Date();
  const printedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;

  doc.setFontSize(8);
  doc.setFont('times', 'normal');
  doc.text(`Printed On : Date/Time :${printedDate}`, pageW - margin, y, { align: 'right' });

  return doc;
}

export async function downloadEquipmentManpowerReportPdf(
  flight: FlightData,
  entries: EquipmentEntry[],
  mainDetails?: MainDetailsData | null,
  verifiedBy?: string,
  manpowerEntries?: ManpowerEntryForPdf[]
): Promise<void> {
  const doc = await buildEquipmentManpowerDetailReportPdf(
    flight,
    entries,
    mainDetails,
    verifiedBy,
    manpowerEntries,
  );
  doc.save(`Equipment-Manpower-Report-${flight.flightNo}-${flight.slNo}.pdf`);
}

/**
 * Detailed equipment + manpower PDF for the Scheduled Team flow.
 * Prefers `fhr_collection.equipmentManpower` embed, then FHR `equipmentDetails` (same basis as GSE),
 * then the standalone equipment-manpower API document.
 */
export async function buildScheduledTeamReportPdfFromFhrEmbed(
  flight: FlightData,
  resolvedSerial: string,
  mainDetails: MainDetailsData | null,
  nonScheduledHeader?: NonScheduledReportHeaderData,
): Promise<jsPDF | null> {
  const base = getApiBase().replace(/\/$/, '');
  const serial = String(resolvedSerial ?? '').trim();
  if (!serial) return null;

  const serialCandidates = [
    serial,
    serial.replace(/^FL-/i, ''),
    serial.replace(/[^0-9]/g, ''),
  ].filter(Boolean);
  const flightForPdf = await enrichFlightForEquipmentReport(
    { ...flight, slNo: resolvedSerial },
    mainDetails,
    Array.from(new Set(serialCandidates)),
  );

  const catalogItems = await fetchEquipmentManpowerMasterCatalog();
  const abbrLookup = buildAbbrDescriptionLookup(catalogItems);
  const unitTypeLookup = buildAbbrUnitTypeLookup(catalogItems);
  const equipmentCodes = buildKnownEquipmentCodeSet(catalogItems);

  const loadStandaloneEquipmentManpower = async (): Promise<{
    equipment: EquipmentEntry[];
    manpower: ManpowerEntryForPdf[];
  }> => {
    const mpRes = await fetch(equipmentManpowerByFlight(serial).get());
    if (!mpRes.ok) return { equipment: [], manpower: [] };
    const text = await mpRes.text();
    if (!text.trim()) return { equipment: [], manpower: [] };
    try {
      const parsed = JSON.parse(text) as { entries?: unknown[] };
      return parseEquipmentManpowerFromApi(
        (Array.isArray(parsed?.entries) ? parsed.entries : []) as {
          name?: string;
          entryType?: string;
          equipmentName?: string;
          equipmentSerialNo?: string;
          employeeName?: string;
          employeeId?: string;
          designation?: string;
          place?: string;
          fromDate?: string;
          fromTime?: string;
          toDate?: string;
          toTime?: string;
          remarks?: string;
        }[],
      );
    } catch {
      return { equipment: [], manpower: [] };
    }
  };

  const buildTeamPdf = async (equipment: EquipmentEntry[], manpower: ManpowerEntryForPdf[]) => {
    const [resolvedEquipment, resolvedManpower] = await Promise.all([
      resolveEquipmentDesignationsFromStaff(equipment),
      resolveEquipmentDesignationsFromStaff(manpower),
    ]);
    return buildEquipmentManpowerDetailReportPdf(
      flightForPdf,
      resolveEquipmentNamesFromCatalog(resolvedEquipment, abbrLookup),
      mainDetails ?? undefined,
      undefined,
      resolvedManpower,
      nonScheduledHeader,
    );
  };

  try {
    const fhrRes = await fetch(
      `${base}/fhr-collection/flight/${encodeURIComponent(serial)}`,
    );
    if (fhrRes.ok) {
      const payload = (await fhrRes.json()) as {
        equipmentManpower?: { entries?: unknown[] } | null;
        equipmentDetails?: unknown[];
      };
      const embedRaw = payload?.equipmentManpower?.entries;
      const fromEmbed = parseEquipmentManpowerFromApi(
        (Array.isArray(embedRaw) ? embedRaw : []) as {
          name?: string;
          entryType?: string;
          equipmentName?: string;
          equipmentSerialNo?: string;
          employeeName?: string;
          employeeId?: string;
          designation?: string;
          place?: string;
          fromDate?: string;
          fromTime?: string;
          toDate?: string;
          toTime?: string;
          remarks?: string;
        }[],
      );
      const standalone = fromEmbed.equipment.length === 0 || fromEmbed.manpower.length === 0
        ? await loadStandaloneEquipmentManpower()
        : { equipment: [], manpower: [] };

      const details = payload?.equipmentDetails;
      const linesFromDetails =
        Array.isArray(details) && details.length > 0
          ? mergeEmployeeFieldsFromManpowerEquipment(
              fhrEquipmentDetailsToEquipmentEntries(details, abbrLookup),
              fromEmbed.equipment.length > 0
                ? fromEmbed.equipment
                : standalone.equipment,
            )
          : [];
      // `equipmentDetails` mixes GSE and staff lines on spreadsheet-seeded stations,
      // so split before they reach the two tables.
      const splitFromDetails = splitEquipmentEntriesByKind(
        linesFromDetails,
        unitTypeLookup,
        equipmentCodes,
      );
      const equipment =
        linesFromDetails.length > 0
          ? splitFromDetails.equipment
          : fromEmbed.equipment.length > 0
            ? fromEmbed.equipment
            : standalone.equipment;
      const manpowerFromForms =
        fromEmbed.manpower.length > 0 ? fromEmbed.manpower : standalone.manpower;
      // Prefer form manpower, but keep spreadsheet staff-code designations /
      // headcount lines when Staff Data lookup would otherwise leave blanks.
      const manpower = mergeTeamManpowerForPdf(
        manpowerFromForms,
        splitFromDetails.manpower,
      );
      if (equipment.length > 0 || manpower.length > 0) {
        return await buildTeamPdf(equipment, manpower);
      }
    }

    const standalone = await loadStandaloneEquipmentManpower();
    if (standalone.equipment.length === 0 && standalone.manpower.length === 0) return null;
    return await buildTeamPdf(standalone.equipment, standalone.manpower);
  } catch {
    return null;
  }
}

/** Build equipment summary PDF without saving (for merging bulk reports). */
export async function buildEquipmentSummaryReportPdf(
  flight: FlightData,
  equipmentEntries: EquipmentSummaryEntry[],
  mainDetails?: MainDetailsData | null,
  options?: {
    manpowerEntries?: EquipmentSummaryEntry[];
    nonScheduledHeader?: NonScheduledReportHeaderData;
  },
): Promise<jsPDF> {
  const manpowerEntries = options?.manpowerEntries ?? [];
  const nonScheduledHeader = options?.nonScheduledHeader;
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const tableW = pageW - 2 * margin;
  let y = 12;

  const logoBase64 = await loadLogoAsBase64();
  const airlineName = mainDetails?.airlineName || flight.airline || '';
  const flightNo = flightNoFromMainDetails(mainDetails, flight.flightNo || '');
  const aircraftType = mainDetails?.aircraftType || flight.aircraft || '';
  const serialNo = flight.slNo;
  const staDate = formatDisplayDate(flight.staDate || '');
  const stdDate = formatDisplayDate(flight.stdDate || '');
  const staTime = formatTime(flight.staTime || '');
  const stdTime = formatTime(flight.stdTime || '');
  const ataDate = formatDisplayDate(mainDetails?.ataDate || '');
  const atdDate = formatDisplayDate(mainDetails?.atdDate || '');
  const ataTime = formatTime(mainDetails?.ataTime || '');
  const atdTime = formatTime(mainDetails?.atdTime || '');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', margin, y - 4, 64, 12); } catch {}
  }

  const rightBlockX = pageW - margin;
  let headerHeight = 18;
  if (nonScheduledHeader) {
    const rightBlockMaxW = Math.max(40, pageW - 2 * margin - 68);
    const operation = String(nonScheduledHeader.operation || 'Turnaround').trim();
    const handlingType = String(nonScheduledHeader.handlingType || 'Non-Scheduled').trim();
    const headerLines = [
      formatReportSerialNoLabel(serialNo),
      `Performa No : ${String(nonScheduledHeader.challanNo || '—').trim()}`,
      `Booking No : ${String(nonScheduledHeader.bookingNo || '—').trim()}`,
      `${operation}   ${handlingType}`,
      `MTOW : ${formatReportMtow(nonScheduledHeader.mtow ?? mainDetails?.mtow)}`,
    ];
    doc.setFont('times', 'normal');
    const blockH = drawPdfRightAlignedBlock(
      doc,
      headerLines,
      rightBlockX,
      y - 2,
      rightBlockMaxW,
      {
        fontSize: 9,
        minFontSize: 6,
        lineHeight: 4,
      },
    );
    headerHeight = Math.max(18, blockH + 2);
  } else {
    doc.setFontSize(10);
    doc.setFont('times', 'bold');
    doc.text(airlineName, rightBlockX, y, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('times', 'normal');
    doc.text(formatReportSerialNoLabel(serialNo), rightBlockX, y + 6, { align: 'right' });
  }

  doc.setFontSize(12);
  doc.setFont('times', 'bold');
  const sumTitle = 'Equipment Report';
  const sumTitleWidth = doc.getTextWidth(sumTitle);
  doc.text(sumTitle, pageW / 2, y + 4, { align: 'center' });
  doc.setLineWidth(0.5);
  doc.line(pageW / 2 - sumTitleWidth / 2, y + 6, pageW / 2 + sumTitleWidth / 2, y + 6);

  y += headerHeight;

  // Flight details block - outer border only, no inner partition lines, font size 8
  const rowH = 8;
  const colWidths = [20, 22, 18, 22, 18, 12, 18, 22, 18, tableW - 170];
  doc.setLineWidth(0.2);
  doc.rect(margin, y, tableW, rowH * 2);
  doc.setFontSize(8);
  let x = margin;
  doc.setFont('times', 'bold');
  doc.text('Flight No :', x + 2, y + 5.5); x += colWidths[0];
  doc.setFont('times', 'normal'); doc.text(flightNo, x + 2, y + 5.5); x += colWidths[1];
  doc.setFont('times', 'bold'); doc.text('STD Date :', x + 2, y + 5.5); x += colWidths[2];
  doc.setFont('times', 'normal'); doc.text(stdDate, x + 2, y + 5.5); x += colWidths[3];
  doc.setFont('times', 'bold'); doc.text('STD Time :', x + 2, y + 5.5); x += colWidths[4];
  doc.setFont('times', 'normal'); doc.text(stdTime, x + 2, y + 5.5); x += colWidths[5];
  doc.setFont('times', 'bold'); doc.text('ATD Date :', x + 2, y + 5.5); x += colWidths[6];
  doc.setFont('times', 'normal'); doc.text(atdDate, x + 2, y + 5.5); x += colWidths[7];
  doc.setFont('times', 'bold'); doc.text('ATD Time:', x + 2, y + 5.5); x += colWidths[8];
  doc.setFont('times', 'normal'); doc.text(atdTime, x + 2, y + 5.5);
  y += rowH;
  x = margin;
  doc.setFont('times', 'bold');
  doc.text('Aircraft Type:', x + 2, y + 5.5); x += colWidths[0];
  doc.setFont('times', 'normal'); doc.text(aircraftType, x + 2, y + 5.5); x += colWidths[1];
  doc.setFont('times', 'bold'); doc.text('STA Date :', x + 2, y + 5.5); x += colWidths[2];
  doc.setFont('times', 'normal'); doc.text(staDate, x + 2, y + 5.5); x += colWidths[3];
  doc.setFont('times', 'bold'); doc.text('STA Time :', x + 2, y + 5.5); x += colWidths[4];
  doc.setFont('times', 'normal'); doc.text(staTime, x + 2, y + 5.5); x += colWidths[5];
  doc.setFont('times', 'bold'); doc.text('ATA Date :', x + 2, y + 5.5); x += colWidths[6];
  doc.setFont('times', 'normal'); doc.text(ataDate, x + 2, y + 5.5); x += colWidths[7];
  doc.setFont('times', 'bold'); doc.text('ATA Time:', x + 2, y + 5.5); x += colWidths[8];
  doc.setFont('times', 'normal'); doc.text(ataTime, x + 2, y + 5.5);
  y += rowH + 4;

  y = drawEquipmentSummaryTable(
    doc,
    margin,
    tableW,
    y,
    equipmentEntries,
    'GSE NAME',
    'No equipment entries found',
  );

  if (manpowerEntries.length > 0) {
    y += 6;
    y = drawEquipmentSummaryTable(
      doc,
      margin,
      tableW,
      y,
      manpowerEntries,
      'MANPOWER NAME',
      'No manpower entries found',
    );
  }

  y += 10;
  y = ensureSummaryPdfSpace(doc, y, 50, margin);
  y = await drawReportSignatureSection(doc, flight.slNo, margin, pageW, y, 'gse');

  const now = new Date();
  const printedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
  doc.setFontSize(8);
  doc.setFont('times', 'normal');
  doc.text(`Printed On : Date/Time :${printedDate}`, pageW - margin, y, { align: 'right' });

  return doc;
}

export async function downloadEquipmentSummaryReportPdf(
  flight: FlightData,
  equipmentEntries: EquipmentSummaryEntry[],
  mainDetails?: MainDetailsData | null,
  /** Kept for call-site compatibility; not yet rendered on this summary layout. */
  _verifiedBy?: string,
  manpowerEntries?: EquipmentSummaryEntry[],
): Promise<void> {
  void _verifiedBy;
  const doc = await buildEquipmentSummaryReportPdf(flight, equipmentEntries, mainDetails, {
    manpowerEntries: manpowerEntries ?? [],
  });
  doc.save(`Equipment-Summary-Report-${flight.flightNo}-${flight.slNo}.pdf`);
}
