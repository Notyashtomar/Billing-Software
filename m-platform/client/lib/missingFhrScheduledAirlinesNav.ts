const MISSING_FHR_PATH = '/fris/reports/missing-fhr';

export type MissingFhrReturnContext = {
  fromYmd: string;
  toYmd: string;
};

export type MissingFhrFlightKind = 'scheduled' | 'non-scheduled';

export function buildScheduledAirlinesHrefFromMissingFhr(
  serial: string,
  ctx: MissingFhrReturnContext,
  openSidebar?: string,
): string {
  const p = new URLSearchParams();
  p.set('highlightSerial', String(serial).trim());
  p.set('from', ctx.fromYmd);
  p.set('to', ctx.toYmd);
  p.set('returnTo', MISSING_FHR_PATH);
  p.set('missingFhrFrom', ctx.fromYmd);
  p.set('missingFhrTo', ctx.toYmd);
  if (openSidebar?.trim()) {
    p.set('openSidebar', openSidebar.trim());
  }
  return `/fris/flights/scheduledairlines?${p.toString()}`;
}

export function buildNonScheduledAirlinesHrefFromMissingFhr(
  serial: string,
  ctx: MissingFhrReturnContext,
  openSidebar?: string,
): string {
  const p = new URLSearchParams();
  p.set('highlightSerial', String(serial).trim());
  p.set('from', ctx.fromYmd);
  p.set('to', ctx.toYmd);
  p.set('returnTo', MISSING_FHR_PATH);
  p.set('missingFhrFrom', ctx.fromYmd);
  p.set('missingFhrTo', ctx.toYmd);
  if (openSidebar?.trim()) {
    p.set('openSidebar', openSidebar.trim());
  }
  return `/fris/flights/non-scheduled-airlines?${p.toString()}`;
}

export function buildAirlinesHrefFromMissingFhr(
  kind: MissingFhrFlightKind,
  serial: string,
  ctx: MissingFhrReturnContext,
  openSidebar?: string,
): string {
  return kind === 'non-scheduled'
    ? buildNonScheduledAirlinesHrefFromMissingFhr(serial, ctx, openSidebar)
    : buildScheduledAirlinesHrefFromMissingFhr(serial, ctx, openSidebar);
}

export function buildMissingFhrReturnHref(
  params: Pick<URLSearchParams, 'get'>,
): string | null {
  const returnTo = params.get('returnTo')?.trim();
  if (!returnTo || returnTo !== MISSING_FHR_PATH) return null;

  const out = new URLSearchParams();
  const from =
    params.get('missingFhrFrom')?.trim() || params.get('from')?.trim() || '';
  const to = params.get('missingFhrTo')?.trim() || params.get('to')?.trim() || '';
  if (from) out.set('from', from);
  if (to) out.set('to', to);

  const qs = out.toString();
  return qs ? `${MISSING_FHR_PATH}?${qs}` : MISSING_FHR_PATH;
}

export function missingFhrReturnLabel(): string {
  return 'Back to Missing FHR report';
}
