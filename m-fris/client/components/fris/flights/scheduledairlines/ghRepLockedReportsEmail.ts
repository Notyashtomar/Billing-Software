import type { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import type { FlightData, MainDetailsData } from '@/utils/dataProcessor';
import { nsFormSerialForFlight } from '@/utils/dataProcessor';
import { getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  buildEquipmentReportPdfForFlight,
  buildScheduledTeamReportPdfFromFhrEmbed,
  downloadMainReportPdf,
} from './reportsPdf';

const fetch = frisFetch;

export type ShareReportTarget = 'airline-fhr' | 'gh-rep-bundle';

function pdfDocToBase64(doc: jsPDF): string {
  const dataUri = doc.output('datauristring');
  const comma = dataUri.indexOf(',');
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}

function isLockedValue(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
}

export function areAllOperationalLocksLocked(flight: Partial<FlightData>): boolean {
  return (
    isLockedValue(flight.rampLocked) &&
    isLockedValue(flight.paxLocked) &&
    isLockedValue(flight.gsdLocked)
  );
}

function isShareFlagEnabled(
  fhr: Record<string, unknown>,
  mainDetails: MainDetailsData | null | undefined,
  key: 'shareFhrToAirline' | 'shareReportsToGhRep',
): boolean {
  if (fhr[key] === true) return true;
  return mainDetails?.[key] === true;
}

function isSentTimestamp(value: unknown): boolean {
  if (value == null || value === '') return false;
  const parsed = new Date(String(value));
  return !Number.isNaN(parsed.getTime());
}

export function mainDetailsFromFhrEmbed(
  fhr: Record<string, unknown>,
): MainDetailsData | null {
  const raw = fhr.mainDetails;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    ...(r as unknown as MainDetailsData),
    ghRep: String(r.ghRep ?? r.PAX_Airline_SignByDate ?? '').trim(),
    shareFhrToAirline:
      r.shareFhrToAirline === true || fhr.shareFhrToAirline === true,
    shareReportsToGhRep:
      r.shareReportsToGhRep === true || fhr.shareReportsToGhRep === true,
  };
}

export async function sendSharedReportsEmail(
  flightSerial: string,
  shareTarget: ShareReportTarget,
  attachments: Array<{ filename: string; pdfBase64: string }>,
): Promise<
  | { sent: true; toEmails: string[]; shareTarget: string }
  | { sent: false; alreadySent: true; toEmails?: string[]; shareTarget: string }
> {
  const base = getApiBase().replace(/\/$/, '');
  const serial = String(flightSerial ?? '').trim();
  const res = await fetch(
    `${base}/fhr-collection/flight/${encodeURIComponent(serial)}/share-reports-email`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareTarget, attachments }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = text?.slice(0, 300) || `Send email failed: ${res.status}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      /* keep msg */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<
    | { sent: true; toEmails: string[]; shareTarget: string }
    | { sent: false; alreadySent: true; toEmails?: string[]; shareTarget: string }
  >;
}

export type SharedReportsSendContext = {
  flight: FlightData;
  fhr: Record<string, unknown>;
  mainDetails?: MainDetailsData | null;
  inFlightKeys: Set<string>;
};

/**
 * When the user opted in via Main Details checkboxes and all locks are complete,
 * email the selected report bundle to the airline or GH representative.
 */
export async function trySendSharedReportsWhenAllLocksLocked(
  ctx: SharedReportsSendContext,
): Promise<void> {
  const key = String(ctx.flight.slNo ?? '').trim();
  if (!key) return;

  const mainDetails =
    ctx.mainDetails ?? mainDetailsFromFhrEmbed(ctx.fhr);
  const wantsAirline = isShareFlagEnabled(ctx.fhr, mainDetails, 'shareFhrToAirline');
  const wantsGhRep = isShareFlagEnabled(ctx.fhr, mainDetails, 'shareReportsToGhRep');
  if (!wantsAirline && !wantsGhRep) return;

  const mergedFlight: FlightData = {
    ...ctx.flight,
    ...partialLocksFromFhr(ctx.fhr),
  };
  if (!areAllOperationalLocksLocked(mergedFlight)) return;

  const airlineAlreadySent = isSentTimestamp(ctx.fhr.airlineFhrEmailSentAt);
  const ghRepAlreadySent = isSentTimestamp(ctx.fhr.ghRepLockedReportsEmailSentAt);
  const sendAirline = wantsAirline && !airlineAlreadySent;
  const sendGhRep = wantsGhRep && !ghRepAlreadySent;
  if (!sendAirline && !sendGhRep) return;

  const inFlightKey = `${key}:${sendAirline ? 'a' : ''}${sendGhRep ? 'g' : ''}`;
  if (ctx.inFlightKeys.has(inFlightKey)) return;
  ctx.inFlightKeys.add(inFlightKey);

  const apiSerial =
    String(nsFormSerialForFlight(ctx.flight) ?? '').trim() || key;
  const safeLabel = `${ctx.flight.flightNo || 'flight'}-${key}`;

  try {
    const fhrDoc = await downloadMainReportPdf(ctx.flight, mainDetails);

    if (sendAirline) {
      const result = await sendSharedReportsEmail(apiSerial, 'airline-fhr', [
        {
          filename: `FHR-Report-${safeLabel}.pdf`,
          pdfBase64: pdfDocToBase64(fhrDoc),
        },
      ]);
      if (result.sent) {
        const to = result.toEmails?.join(', ') || 'airline';
        toast.success(`FHR report emailed to ${to}.`);
        ctx.fhr.airlineFhrEmailSentAt = new Date().toISOString();
      }
    }

    if (sendGhRep) {
      const gseDoc = await buildEquipmentReportPdfForFlight(ctx.flight, mainDetails);
      const teamDoc = await buildScheduledTeamReportPdfFromFhrEmbed(
        ctx.flight,
        apiSerial,
        mainDetails,
      );
      if (!gseDoc) {
        toast.error('Could not build GSE report PDF for GH representative email.');
        return;
      }
      if (!teamDoc) {
        toast.error('Could not build Team report PDF for GH representative email.');
        return;
      }

      const result = await sendSharedReportsEmail(apiSerial, 'gh-rep-bundle', [
        {
          filename: `FHR-Report-${safeLabel}.pdf`,
          pdfBase64: pdfDocToBase64(fhrDoc),
        },
        {
          filename: `GSE-Report-${safeLabel}.pdf`,
          pdfBase64: pdfDocToBase64(gseDoc),
        },
        {
          filename: `Team-Report-${safeLabel}.pdf`,
          pdfBase64: pdfDocToBase64(teamDoc),
        },
      ]);
      if (result.sent) {
        const to = result.toEmails?.join(', ') || 'GH representative';
        toast.success(`FHR, GSE, and Team reports emailed to ${to}.`);
        ctx.fhr.ghRepLockedReportsEmailSentAt = new Date().toISOString();
      }
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Failed to email shared reports.';
    toast.error(msg);
  } finally {
    ctx.inFlightKeys.delete(inFlightKey);
  }
}

function partialLocksFromFhr(fhr: Record<string, unknown>): Partial<FlightData> {
  const fhrR1 =
    fhr.rampDetails1 != null &&
    typeof fhr.rampDetails1 === 'object' &&
    !Array.isArray(fhr.rampDetails1);
  const fhrT =
    fhr.terminalDetails != null &&
    typeof fhr.terminalDetails === 'object' &&
    !Array.isArray(fhr.terminalDetails);
  const eqE = fhr.equipmentManpower;
  let fhrG = false;
  if (eqE != null && typeof eqE === 'object' && !Array.isArray(eqE)) {
    const e = eqE as Record<string, unknown>;
    const entries = Array.isArray(e.entries) ? e.entries : [];
    if (entries.length > 0) fhrG = true;
    else {
      for (const k of [
        'verifiedBy',
        'verifiedAt',
        'verifiedByCode',
        'flightNo',
        'airlinesOperator',
        'sta',
        'staDate',
        'std',
        'stdDate',
        'acType',
        'routing',
        'operations',
      ]) {
        if (String(e[k] ?? '').trim()) {
          fhrG = true;
          break;
        }
      }
    }
  }
  return {
    rampLocked: fhrR1 ? 'Yes' : 'No',
    paxLocked: fhrT ? 'Yes' : 'No',
    gsdLocked: fhrG ? 'Yes' : 'No',
  };
}
