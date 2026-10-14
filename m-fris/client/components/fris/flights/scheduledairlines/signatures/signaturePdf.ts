import type { jsPDF } from 'jspdf';
import {
  fetchResolvedFhrSignatures,
  type ResolvedFhrSignatures,
} from '@/lib/api';

export type SignatureReportKind = 'fhr' | 'gse' | 'team';

/**
 * Resolve render-ready signatures for a flight from the reusable repository
 * (image data resolved by reference id, falling back to the legacy embed).
 * Never throws — returns null if signatures are unavailable.
 */
export async function resolveSignaturesForPdf(
  serialKey: string | number | undefined,
  report: SignatureReportKind,
): Promise<ResolvedFhrSignatures | null> {
  const key = String(serialKey ?? '').trim();
  if (!key) return null;
  try {
    return await fetchResolvedFhrSignatures(key, report);
  } catch {
    return null;
  }
}

/** Format a signed timestamp as `dd Mon yyyy, HH:mm`. */
export function formatSignedAt(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd} ${mon} ${d.getFullYear()}, ${hh}:${mm}`;
}

/** Embed a base64 signature image inside the given box (no-op on failure). */
export function placeSignatureImage(
  doc: InstanceType<typeof jsPDF>,
  dataUrl: string | undefined,
  x: number,
  yPos: number,
  w: number,
  h: number,
): void {
  if (!dataUrl || !/^data:image\//.test(dataUrl)) return;
  try {
    const fmt = /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG';
    doc.addImage(dataUrl, fmt, x, yPos, w, h);
  } catch {
    /* ignore bad signature image */
  }
}
