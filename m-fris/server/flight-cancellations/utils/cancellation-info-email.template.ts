import { splitIntimationDatetime } from './intimation-datetime.util';
import { parseRouteSectors } from './cancellation-route.util';
import { airportCityName } from './station-logo.util';

/** Row fields used by deliverCancellationInfoEmail — keep in sync with service. */
export type CancellationInfoEmailRow = {
  instanceSerial: string;
  cancelledDate: string;
  flightNo: string;
  airlineName: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  route: string;
  reason: string;
  intimatedBy?: string;
  intimationPersonEmail?: string;
  intimationMedia?: string;
  intimationTime?: string;
  intimationMode?: string;
};

export type CancellationInfoEmailOptions = {
  senderBrandName?: string;
  /** cid:, https URL, or remote image URL for station logo */
  stationLogoSrc?: string | null;
  /** cid: or https URL for airline logo (top-right header) */
  airlineLogoSrc?: string | null;
};

const FONT = 'Arial, Helvetica, sans-serif';

/** Shared max height for Bird + airline logos in the email header row. */
const EMAIL_HEADER_LOGO_MAX_HEIGHT_PX = 64;

const emailHeaderLogoImgStyle = (
  maxWidthPx: number,
  maxHeightPx: number = EMAIL_HEADER_LOGO_MAX_HEIGHT_PX,
  objectPosition = 'left center',
): string => `
  display:block;
  width:auto;
  height:auto;

  max-width:${maxWidthPx}px;
  max-height:${maxHeightPx}px;

  object-fit:contain;
  object-position:${objectPosition};

  line-height:100%;
  font-size:0;

  border:0;
  outline:none;
  text-decoration:none;

  -ms-interpolation-mode:bicubic;
`;

/** Light mode — light emerald surfaces, black/dark text (default + inline fallback). */
const L = {
  pageBg: '#FFFFFF',
  shell: '#D7F5EA',
  card: '#ECFDF5',
  cardAlt: '#D1FAE5',
  primary: '#000000',
  secondary: '#064E3B',
  muted: '#16624F',
  label: '#0B5D46',
  border: '#86EFAC',
  divider: '#A7F3D0',
  gold: '#B45309',
  goldDark: '#92400E',
  goldBg: '#FEF9C3',
  goldBorder: '#D4A017',
  logoBar: '#FFFFFF',
  logoBarBorder: '#A7D7C5',
  logoFallback: '#064E3B',
  footer: '#064E3B',
  footerMuted: '#16624F',
  cardShadow: '0 2px 10px rgba(6,78,59,0.08)',
  heroShadow: '0 4px 16px rgba(6,78,59,0.12)',
};

/** Dark mode — emerald surfaces, white/light text. */
const D = {
  pageBg: '#071E16',
  shell: '#0B241B',
  card: '#0F2E22',
  cardAlt: '#123728',
  primary: '#FFFFFF',
  secondary: '#E6FFF5',
  muted: '#B7E4D3',
  label: '#9FD3BC',
  border: '#1C5B45',
  divider: '#2A6A54',
  gold: '#F4B942',
  goldDark: '#FFE2A6',
  goldBg: '#17352A',
  goldBorder: '#F4B942',
  logoBar: '#FFFFFF',
  logoBarBorder: '#E8F5EF',
  logoFallback: '#064E3B',
  footer: '#E6FFF5',
  footerMuted: '#9FD3BC',
  cardShadow: '0 2px 10px rgba(0,0,0,0.14)',
  heroShadow: '0 8px 28px rgba(0,0,0,0.28)',
};

/** Email CSS: light default; dark via prefers-color-scheme + Outlook hints. */
export function cancellationEmailThemeCss(): string {
  const darkBlock = `
    body { background-color:#FFFFFF !important; }
    .theme-page, .theme-page > tbody > tr > td { background-color:#FFFFFF !important; }
    .theme-logo-bar, .theme-logo-bar td { background-color:${L.logoBar} !important; border-color:${L.logoBarBorder} !important; }
    .theme-card {
      background:linear-gradient(180deg,${D.cardAlt} 0%,${D.card} 100%) !important;
      border-color:${D.border} !important;
      box-shadow:${D.heroShadow} !important;
    }
    .theme-section-card { box-shadow:${D.cardShadow} !important; }
    .theme-text-primary { color:${D.primary} !important; }
    .theme-text-secondary { color:${D.secondary} !important; }
    .theme-text-muted { color:${D.muted} !important; }
    .theme-text-label { color:${D.label} !important; }
    .theme-section-title { color:${D.secondary} !important; }
    .theme-divider-top { border-top-color:${D.divider} !important; }
    .theme-row-divider { border-bottom-color:${D.divider} !important; }
    .theme-conn-muted { color:${D.divider} !important; }
    .theme-conn-gold { color:${D.gold} !important; }
    .theme-gold-pill { background-color:${L.logoBar} !important; border-color:${L.goldBorder} !important; }
    .theme-gold-pill-text { color:${D.gold} !important; }
    .theme-status-box { background-color:${D.goldBg} !important; border-color:${D.goldBorder} !important; }
    .theme-status-label { color:${D.goldDark} !important; }
    .theme-status-value { color:${D.gold} !important; }
    .theme-footer { color:${D.footer} !important; }
    .theme-footer-muted { color:${D.footerMuted} !important; }
    .theme-logo-fallback { color:${D.logoFallback} !important; }
  `;

  return `
    :root { color-scheme:light dark; supported-color-schemes:light dark; }
    body { background-color:${L.pageBg} !important; }
    .theme-page, .theme-page > tbody > tr > td { background-color:${L.pageBg} !important; }
    .theme-logo-bar { background-color:${L.logoBar} !important; border:1px solid ${L.logoBarBorder} !important; }
    .theme-logo-bar td { background-color:${L.logoBar} !important; }
    .theme-card {
      background:linear-gradient(180deg,${L.cardAlt} 0%,${L.card} 100%) !important;
      border:1px solid ${L.border} !important;
      box-shadow:${L.heroShadow} !important;
    }
    .theme-section-card { box-shadow:${L.cardShadow} !important; }
    .theme-text-primary { color:${L.primary} !important; }
    .theme-text-secondary { color:${L.secondary} !important; }
    .theme-text-muted { color:${L.muted} !important; }
    .theme-text-label { color:${L.label} !important; }
    .theme-section-title { color:${L.secondary} !important; }
    .theme-divider-top { border-top:1px solid ${L.divider} !important; }
    .theme-row-divider { border-bottom:1px solid ${L.divider} !important; }
    .theme-conn-muted { color:${L.divider} !important; }
    .theme-conn-gold { color:${L.gold} !important; }
    .theme-gold-pill { background-color:${L.goldBg} !important; border:1px solid ${L.goldBorder} !important; }
    .theme-gold-pill-text { color:${L.gold} !important; }
    .theme-status-box { background-color:${L.goldBg} !important; border:1px solid ${L.goldBorder} !important; }
    .theme-status-label { color:${L.goldDark} !important; }
    .theme-status-value { color:${L.gold} !important; }
    .theme-footer { color:${L.footer} !important; }
    .theme-footer-muted { color:${L.footerMuted} !important; }
    .theme-logo-fallback { color:${L.logoFallback} !important; }
    @media (prefers-color-scheme:dark) {
      ${darkBlock}
    }
    [data-ogsc] .theme-page, [data-ogsc] .theme-page > tbody > tr > td { background-color:#FFFFFF !important; }
    [data-ogsc] .theme-card {
      background:linear-gradient(180deg,${D.cardAlt} 0%,${D.card} 100%) !important;
      border-color:${D.border} !important;
    }
    [data-ogsc] .theme-text-primary { color:${D.primary} !important; }
    [data-ogsc] .theme-text-secondary { color:${D.secondary} !important; }
    [data-ogsc] .theme-text-muted { color:${D.muted} !important; }
    [data-ogsc] .theme-text-label { color:${D.label} !important; }
    [data-ogsc] .theme-section-title { color:${D.secondary} !important; }
    [data-ogsc] .theme-conn-muted { color:${D.divider} !important; }
    [data-ogsc] .theme-conn-gold { color:${D.gold} !important; }
    [data-ogsc] .theme-footer { color:${D.footer} !important; }
    [data-ogsc] .theme-footer-muted { color:${D.footerMuted} !important; }
    [data-ogsc] body { background-color:#FFFFFF !important; }
    [data-ogsc] .theme-logo-bar, [data-ogsc] .theme-logo-bar td { background-color:${L.logoBar} !important; border-color:${L.logoBarBorder} !important; }
    [data-ogsc] .theme-gold-pill { background-color:${L.logoBar} !important; border-color:${L.goldBorder} !important; }
    [data-ogsc] .theme-gold-pill-text { color:${D.gold} !important; }
    [data-ogsc] .theme-status-box { background-color:${D.goldBg} !important; border-color:${D.goldBorder} !important; }
    [data-ogsc] .theme-status-label { color:${D.goldDark} !important; }
    [data-ogsc] .theme-status-value { color:${D.gold} !important; }
  `;
}

function intimationDateTimeParts(row: CancellationInfoEmailRow): {
  date: string;
  time: string;
} {
  const split = splitIntimationDatetime(String(row.intimationTime ?? ''));
  if (split.date) return split;
  return { date: '', time: '' };
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function displayValue(value: string): string {
  const v = String(value ?? '').trim();
  return v ? escapeHtml(v) : '—';
}

/** Format yyyy-MM-dd or dd/MM/yyyy → "30 Mar 2026". */
export function formatDisplayDate(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  let y = '';
  let mo = '';
  let d = '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    y = iso[1];
    mo = iso[2];
    d = iso[3];
  } else {
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
    if (dmy) {
      d = dmy[1].padStart(2, '0');
      mo = dmy[2].padStart(2, '0');
      y = dmy[3];
    }
  }
  if (!y || !mo || !d) return raw;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const mi = parseInt(mo, 10) - 1;
  if (mi < 0 || mi > 11) return raw;
  return `${parseInt(d, 10)} ${months[mi]} ${y}`;
}

function sectionIconSquare(): string {
  return `<span class="theme-conn-gold" style="display:inline-block;width:8px;height:8px;background-color:${L.gold};border-radius:2px;margin-right:10px;vertical-align:middle;line-height:1;">&nbsp;</span>`;
}

/** Label left / value right with divider — matches reference detail rows. */
function detailRow(label: string, value: string, isLast = false): string {
  const border = isLast
    ? ''
    : `border-bottom:1px solid ${L.divider};`;
  const borderClass = isLast ? '' : ' theme-row-divider';
  return `
    <tr>
      <td colspan="2" style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="48%" valign="top" class="stack kv-label theme-text-label${borderClass}" style="padding:14px 16px 14px 0;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${L.label};letter-spacing:0.03em;${border}">
              ${escapeHtml(label)}
            </td>
            <td width="52%" valign="top" align="right" class="stack kv-value theme-text-primary${borderClass}" style="padding:14px 0;font-family:${FONT};font-size:18px;font-weight:700;line-height:1.4;color:${L.primary};text-align:right;${border}">
              ${displayValue(value)}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function sectionCard(title: string, rowsHtml: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="theme-card theme-section-card" style="margin:0 0 16px;border-collapse:separate;border:1px solid ${L.border};border-radius:16px;background:linear-gradient(180deg,${L.cardAlt} 0%,${L.card} 100%);box-shadow:${L.cardShadow};">
      <tr>
        <td class="theme-section-title" style="padding:18px 20px 10px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.3;color:${L.secondary};text-transform:uppercase;letter-spacing:0.05em;">
          ${escapeHtml(title)}
        </td>
      </tr>
      <tr>
        <td style="padding:0 20px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rowsHtml}
          </table>
        </td>
      </tr>
      <tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
    </table>`;
}

/** Route connector — Outlook-safe em dash + arrow (no inline-block borders). */
function routeConnectorCell(): string {
  return `
    <td align="center" valign="middle" width="56" style="padding:0 8px;vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td align="center" valign="middle" style="font-family:${FONT};font-size:15px;line-height:1;white-space:nowrap;vertical-align:middle;">
            <span class="theme-conn-muted" style="color:${L.divider};font-weight:400;">&#8212;</span><span class="theme-conn-gold" style="color:${L.gold};font-weight:700;padding:0 6px;font-size:16px;">&#8594;</span><span class="theme-conn-muted" style="color:${L.divider};font-weight:400;">&#8212;</span>
          </td>
        </tr>
      </table>
    </td>`;
}

/** Dynamic route: sectors with centered arrow connectors (reference proportions). */
function routeVisualizationHtml(route: string): string {
  const sectors = parseRouteSectors(route);
  if (sectors.length === 0) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px;">
        <tr>
          <td align="center" class="theme-text-primary" style="font-family:${FONT};font-size:15px;font-weight:600;color:${L.primary};">
            ${displayValue(route)}
          </td>
        </tr>
      </table>`;
  }

  const airportCells = sectors
    .map((sector, idx) => {
      const stationName =
        String(sector.city ?? '').trim() ||
        airportCityName(sector.code) ||
        '';
      const airport = `
      <td
        align="center"
        valign="middle"
        style="
          padding:0 4px;
          vertical-align:middle;
        "
      >
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
        >
          <tr>
            <td
              align="center"
              class="theme-text-primary"
              style="
                font-family:${FONT};
                font-size:34px;
                font-weight:700;
                line-height:1;
                color:${L.primary};
                letter-spacing:0.04em;
                text-align:center;
                white-space:nowrap;
              "
            >
              ${escapeHtml(sector.code)}
            </td>
          </tr>

          <tr>
            <td
              align="center"
              class="theme-text-muted"
              style="
                padding-top:6px;
                font-family:${FONT};
                font-size:13px;
                font-weight:500;
                color:${L.muted};
                text-align:center;
                white-space:nowrap;
              "
            >
              ${stationName ? escapeHtml(stationName) : '&#160;'}
            </td>
          </tr>
        </table>
      </td>
    `;

      return idx === 0
        ? airport
        : `${routeConnectorCell()}${airport}`;
    })
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr valign="middle">${airportCells}</tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function scheduleBlock(label: string, time: string, date: string): string {
  const t = displayValue(time);
  const d = formatDisplayDate(date) || displayValue(date);
  return `
    <td width="50%" align="center" valign="top" class="stack schedule-col" style="padding:16px 12px 4px;vertical-align:top;">
      <div class="theme-text-muted" style="font-family:${FONT};font-size:10px;font-weight:700;color:${L.muted};text-transform:uppercase;letter-spacing:0.1em;text-align:center;">
        ${escapeHtml(label)}
      </div>
      <div class="theme-text-primary" style="margin-top:10px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.2;color:${L.primary};text-align:center;">
        ${t}
      </div>
      <div class="theme-text-muted" style="margin-top:6px;font-family:${FONT};font-size:13px;font-weight:500;line-height:1.3;color:${L.muted};text-align:center;">
        ${d}
      </div>
    </td>`;
}

/** Top-right header — airline logo from DB, or uppercase name fallback. */
function headerAirlinePill(
  airlineName: string,
  airlineLogoSrc?: string | null,
): string {
  const label = escapeHtml(
    (String(airlineName ?? '').trim() || '—').toUpperCase(),
  );
  const logoSrc = String(airlineLogoSrc ?? '').trim();

  if (logoSrc) {
    return `
    <img
      src="${escapeAttr(logoSrc)}"
      alt="${label}"
      width="150"
      style="${emailHeaderLogoImgStyle(150, EMAIL_HEADER_LOGO_MAX_HEIGHT_PX, 'right center')}"
    />
  `;
  }

  const inner = `
          <span
            class="theme-gold-pill-text"
            style="
              font-size:11px;
              font-weight:700;
              color:${L.gold};
              letter-spacing:0.14em;
              text-transform:uppercase;
              white-space:nowrap;
            "
          >
            ${label}
          </span>
        `;

  return `
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      border="0"
      align="right"
    >
      <tr>
        <td
          align="center"
          class="theme-gold-pill"
          style="padding:8px 14px;border:1px solid ${L.goldBorder};border-radius:14px;background-color:${L.goldBg};font-family:${FONT};"
        >
          ${inner}
        </td>
      </tr>
    </table>
  `;
}

/** Yellow box — flight number + cancelled status, centered in hero card. */
function heroStatusBox(flightNo: string): string {
  return `
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      border="0"
      align="center"
      style="margin:0 auto;"
    >
      <tr>
        <td
          align="center"
          class="theme-status-box"
          style="
            padding:16px 24px;
            border:1px solid ${L.goldBorder};
            border-radius:14px;
            background-color:${L.goldBg};
            min-width:130px;
          "
        >
          <div
            class="hero-flight theme-status-value"
            style="
              font-family:${FONT};
              font-size:28px;
              font-weight:800;
              line-height:1;
              color:${L.gold};
              letter-spacing:0.04em;
            "
          >
            ${displayValue(flightNo)}
          </div>

          <div
            class="theme-status-value"
            style="
              margin-top:10px;
              font-family:${FONT};
              font-size:28px;
              font-weight:800;
              line-height:1;
              color:${L.gold};
              letter-spacing:0.04em;
            "
          >
            CANCELLED
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Production HTML for Flight Cancellation Notice — layout aligned to reference design.
 */
export function buildCancellationInfoEmailHtml(
  row: CancellationInfoEmailRow,
  options?: CancellationInfoEmailOptions,
): string {
  const logoSrc = options?.stationLogoSrc?.trim() || '';
  const airlineLogoSrc = options?.airlineLogoSrc?.trim() || '';
  const airline = String(row.airlineName ?? '').trim() || '—';
  const flightNo = String(row.flightNo ?? '').trim() || '—';
  const reason = String(row.reason ?? '').trim() || '—';
  const routeRaw = String(row.route ?? '').trim();
  const cancelledDisplay =
    formatDisplayDate(row.cancelledDate) || displayValue(row.cancelledDate);
  const generatedDisplay =
    formatDisplayDate(row.cancelledDate) ||
    formatDisplayDate(new Date().toISOString().slice(0, 10));

  const { date: intimationDate, time: intimationTimeOnly } =
    intimationDateTimeParts(row);

  const logoAlt = escapeHtml(options?.senderBrandName?.trim() || 'Bird Group');
  const logoHtml = logoSrc
    ? `
    <img
      src="${escapeAttr(logoSrc)}"
      alt="${logoAlt}"
      width="180"
      style="${emailHeaderLogoImgStyle(180)}"
    />
  `
    : `
    <div
      class="theme-logo-fallback"
      style="
        font-family:${FONT};
        font-size:22px;
        font-weight:700;
        color:${L.logoFallback};
        letter-spacing:0.04em;
      "
    >
      Bird Group
    </div>
  `;

  const flightRows = [
    detailRow('Flight No.', String(row.flightNo ?? ''), false),
    detailRow('Airline', airline, false),
    detailRow('Cancelled Date', cancelledDisplay, true),
  ].join('');

  const intimationRows = [
    detailRow('Intimated By', String(row.intimatedBy ?? ''), false),
    detailRow('Intimation Person Email', String(row.intimationPersonEmail ?? ''), false),
    detailRow('Intimation Media', String(row.intimationMedia ?? ''), false),
    detailRow('Time Of Intimation', intimationTimeOnly, false),
    detailRow('Date Of Intimation', formatDisplayDate(intimationDate) || intimationDate, false),
    detailRow('Intimation Mode', String(row.intimationMode ?? ''), true),
  ].join('');

  const additionalRows = [
    detailRow('Serial No.', String(row.instanceSerial ?? ''), false),
    detailRow('Reason', reason, true),
  ].join('');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Flight Cancellation Notice</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    .logo-header-logo-cell img {
      height:auto !important;
      max-height:${EMAIL_HEADER_LOGO_MAX_HEIGHT_PX}px !important;
      width:auto !important;
      object-fit:contain !important;
    }
    ${cancellationEmailThemeCss()}
    @media only screen and (max-width: 620px) {
      .wrapper { width:100% !important; max-width:100% !important; }
      .outer-pad { padding:12px 8px !important; }
      .logo-header-pad { padding:0 12px !important; }
      .content-pad { padding:16px 14px !important; }
      .stack { display:block !important; width:100% !important; max-width:100% !important; }
      .stack-center { text-align:center !important; }
      .hero-flight { font-size:22px !important; }
      .status-cell { text-align:center !important; padding-top:14px !important; }
      .status-cell table { margin:0 auto !important; }
      .header-pill-cell { text-align:center !important; padding-top:0 !important; }
      .header-pill-cell table { margin:0 auto !important; }
      .kv-label { text-align:left !important; padding-bottom:4px !important; }
      .kv-value { text-align:left !important; }
      .footer-right { text-align:left !important; padding-top:8px !important; }
      .schedule-col { display:block !important; width:100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${L.pageBg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.pageBg}" style="background-color:${L.pageBg};">
    <tr>
      <td align="center" class="outer-pad theme-page" style="padding:24px 16px;background-color:${L.pageBg};">
        <table role="presentation" class="wrapper theme-page" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:600px;width:100%;background-color:${L.pageBg};">

          <!-- TOP HEADER: white logo bar (logo via cid: inline attachment) -->
          <tr>
            <td style="padding:0 0 8px;">
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                bgcolor="${L.logoBar}"
                class="theme-logo-bar"
                style="
                  background-color:${L.logoBar};
                  border:1px solid ${L.logoBarBorder};
                  border-radius:18px;
                "
              >
                <tr>
                  <td
                    bgcolor="${L.logoBar}"
                    class="logo-header-pad theme-logo-bar"
                    style="padding:0 8px;line-height:0;font-size:0;background-color:${L.logoBar};"
                  >
                    <table
                      role="presentation"
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="line-height:0;font-size:0;"
                    >
                      <tr style="line-height:0;font-size:0;">
                        <td
                          class="stack logo-header-logo-cell"
                          valign="middle"
                          align="left"
                          bgcolor="${L.logoBar}"
                          style="padding:0;line-height:0;font-size:0;vertical-align:middle;background-color:${L.logoBar};"
                        >
                          ${logoHtml}
                        </td>

                        <td
                          class="stack header-pill-cell logo-header-logo-cell"
                          valign="middle"
                          align="right"
                          bgcolor="${L.logoBar}"
                          style="padding:0 0 0 12px;line-height:0;font-size:0;vertical-align:middle;background-color:${L.logoBar};"
                        >
                          ${headerAirlinePill(airline, airlineLogoSrc)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- MAIN ROUTE CARD -->
          <tr>
            <td style="padding:0 0 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="theme-card" style="border:1px solid ${L.border};border-radius:16px;background:linear-gradient(180deg,${L.cardAlt} 0%,${L.card} 100%);box-shadow:${L.heroShadow};">
                <tr>
                  <td style="padding:22px 20px 18px;">
                    <!-- Flight no (yellow box) centered -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="stack status-cell" align="center" valign="top" style="vertical-align:top;text-align:center;padding-bottom:20px;">
                          ${heroStatusBox(flightNo)}
                        </td>
                      </tr>
                    </table>

                    ${routeVisualizationHtml(routeRaw)}

                    <!-- STA / STD -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="theme-divider-top" style="margin-top:8px;border-top:1px solid ${L.divider};">
                      <tr>
                        ${scheduleBlock('Arrival (STA)', row.staTime, row.staDate)}
                        ${scheduleBlock('Departure (STD)', row.stdTime, row.stdDate)}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FLIGHT DETAILS -->
          <tr>
            <td style="padding:0;">
              ${sectionCard('Flight Details', flightRows)}
            </td>
          </tr>

          <!-- INTIMATION DETAILS (no Verified By) -->
          <tr>
            <td style="padding:0;">
              ${sectionCard('Intimation Details', intimationRows)}
            </td>
          </tr>

          <!-- ADDITIONAL INFORMATION -->
          <tr>
            <td style="padding:0;">
              ${sectionCard('Additional Information', additionalRows)}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:8px 4px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="stack theme-footer" valign="middle" style="font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${L.footer};vertical-align:middle;">
                    ${sectionIconSquare()}Serial ${displayValue(String(row.instanceSerial ?? ''))}
                  </td>
                  <td class="stack footer-right theme-footer-muted" align="right" valign="middle" style="font-family:${FONT};font-size:14px;font-weight:500;line-height:1.4;color:${L.footerMuted};text-align:right;vertical-align:middle;">
                    Generated automatically &middot; ${generatedDisplay}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildCancellationInfoEmailPlainText(
  row: CancellationInfoEmailRow,
): string {
  const reason = String(row.reason ?? '').trim() || '-';
  const { date: intimationDate, time: intimationTimeOnly } =
    intimationDateTimeParts(row);
  const cancelledDisplay =
    formatDisplayDate(row.cancelledDate) || String(row.cancelledDate ?? '');
  const sectors = parseRouteSectors(String(row.route ?? ''));
  const routeLine =
    sectors.length > 0
      ? sectors.map((s) => `${s.code}${s.city ? ` (${s.city})` : ''}`).join(' → ')
      : String(row.route ?? '').trim() || '-';

  return [
    'Flight Cancellation Notice',
    '',
    `Flight No.: ${String(row.flightNo ?? '')}`,
    `Airline: ${String(row.airlineName ?? '')}`,
    'Status: CANCELLED',
    `Route: ${routeLine}`,
    `STA: ${String(row.staTime ?? '')} ${formatDisplayDate(row.staDate) || row.staDate}`,
    `STD: ${String(row.stdTime ?? '')} ${formatDisplayDate(row.stdDate) || row.stdDate}`,
    `Cancelled Date: ${cancelledDisplay}`,
    '',
    '--- Flight Details ---',
    `Flight no.: ${String(row.flightNo ?? '')}`,
    `Airline: ${String(row.airlineName ?? '')}`,
    `Cancelled date: ${cancelledDisplay}`,
    '',
    '--- Intimation Details ---',
    `Intimated by: ${String(row.intimatedBy ?? '').trim() || '-'}`,
    `Intimation person email: ${String(row.intimationPersonEmail ?? '').trim() || '-'}`,
    `Intimation media: ${String(row.intimationMedia ?? '').trim() || '-'}`,
    `Time of intimation: ${intimationTimeOnly || '-'}`,
    `Date of intimation: ${formatDisplayDate(intimationDate) || intimationDate || '-'}`,
    `Intimation mode: ${String(row.intimationMode ?? '').trim() || '-'}`,
    '',
    '--- Additional Information ---',
    `Serial no.: ${String(row.instanceSerial ?? '')}`,
    `Reason: ${reason}`,
    '',
    `Generated automatically · ${cancelledDisplay}`,
  ].join('\n');
}

export type BrandedOtpEmailParams = {
  otp: string;
  title: string;
  /** Gold-box caption under the OTP (e.g. CANCEL OTP). */
  statusCaption?: string;
  expiresNote: string;
  details: Array<{ label: string; value: string }>;
  securityNote?: string;
  senderBrandName?: string;
  stationLogoSrc?: string | null;
};

function heroOtpBox(otp: string, caption: string): string {
  return `
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      border="0"
      align="center"
      style="margin:0 auto;"
    >
      <tr>
        <td
          align="center"
          class="theme-status-box"
          style="
            padding:16px 24px;
            border:1px solid ${L.goldBorder};
            border-radius:14px;
            background-color:${L.goldBg};
            min-width:130px;
          "
        >
          <div
            class="theme-status-label"
            style="
              font-family:${FONT};
              font-size:11px;
              font-weight:700;
              line-height:1;
              color:${L.goldDark};
              letter-spacing:0.12em;
              text-transform:uppercase;
            "
          >
            ${escapeHtml(caption || 'ONE-TIME PASSWORD')}
          </div>
          <div
            class="hero-flight theme-status-value"
            style="
              margin-top:12px;
              font-family:${FONT};
              font-size:36px;
              font-weight:800;
              line-height:1;
              color:${L.gold};
              letter-spacing:0.22em;
            "
          >
            ${displayValue(otp)}
          </div>
        </td>
      </tr>
    </table>
  `;
}

/** Same chrome as Flight Cancellation Notice — OTP / reset codes. */
export function buildBrandedOtpEmailHtml(params: BrandedOtpEmailParams): string {
  const logoSrc = String(params.stationLogoSrc ?? '').trim();
  const logoAlt = escapeHtml(params.senderBrandName?.trim() || 'Bird Group');
  const generatedDisplay = formatDisplayDate(
    new Date().toISOString().slice(0, 10),
  );
  const title = String(params.title ?? '').trim() || 'One-time password';
  const detailsRows = (params.details ?? [])
    .map((row, idx, arr) =>
      detailRow(row.label, row.value, idx === arr.length - 1),
    )
    .join('');
  const logoHtml = logoSrc
    ? `
    <img
      src="${escapeAttr(logoSrc)}"
      alt="${logoAlt}"
      width="180"
      style="${emailHeaderLogoImgStyle(180)}"
    />
  `
    : `
    <div
      class="theme-logo-fallback"
      style="
        font-family:${FONT};
        font-size:22px;
        font-weight:700;
        color:${L.logoFallback};
        letter-spacing:0.04em;
      "
    >
      Bird Group
    </div>
  `;

  const securityHtml = params.securityNote
    ? `<tr>
            <td style="padding:0;">
              ${sectionCard(
                'Important',
                detailRow('Note', params.securityNote, true),
              )}
            </td>
          </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    .logo-header-logo-cell img {
      height:auto !important;
      max-height:${EMAIL_HEADER_LOGO_MAX_HEIGHT_PX}px !important;
      width:auto !important;
      object-fit:contain !important;
    }
    ${cancellationEmailThemeCss()}
    @media only screen and (max-width: 620px) {
      .wrapper { width:100% !important; max-width:100% !important; }
      .outer-pad { padding:12px 8px !important; }
      .logo-header-pad { padding:0 12px !important; }
      .content-pad { padding:16px 14px !important; }
      .stack { display:block !important; width:100% !important; max-width:100% !important; }
      .hero-flight { font-size:28px !important; }
      .status-cell { text-align:center !important; }
      .kv-label { text-align:left !important; padding-bottom:4px !important; }
      .kv-value { text-align:left !important; }
      .footer-right { text-align:left !important; padding-top:8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${L.pageBg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.pageBg}" style="background-color:${L.pageBg};">
    <tr>
      <td align="center" class="outer-pad theme-page" style="padding:24px 16px;background-color:${L.pageBg};">
        <table role="presentation" class="wrapper theme-page" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:600px;width:100%;background-color:${L.pageBg};">
          <tr>
            <td style="padding:0 0 8px;">
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                bgcolor="${L.logoBar}"
                class="theme-logo-bar"
                style="background-color:${L.logoBar};border:1px solid ${L.logoBarBorder};border-radius:18px;"
              >
                <tr>
                  <td
                    bgcolor="${L.logoBar}"
                    class="logo-header-pad theme-logo-bar"
                    style="padding:12px 16px;background-color:${L.logoBar};"
                  >
                    ${logoHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="theme-card" style="border:1px solid ${L.border};border-radius:16px;background:linear-gradient(180deg,${L.cardAlt} 0%,${L.card} 100%);box-shadow:${L.heroShadow};">
                <tr>
                  <td style="padding:22px 20px 18px;">
                    <div class="theme-section-title" style="font-family:${FONT};font-size:16px;font-weight:700;line-height:1.3;color:${L.secondary};text-transform:uppercase;letter-spacing:0.05em;text-align:center;margin-bottom:16px;">
                      ${escapeHtml(title)}
                    </div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="stack status-cell" align="center" valign="top" style="vertical-align:top;text-align:center;padding-bottom:8px;">
                          ${heroOtpBox(params.otp, params.statusCaption ?? 'ONE-TIME PASSWORD')}
                        </td>
                      </tr>
                    </table>
                    <div class="theme-text-muted" style="margin-top:16px;font-family:${FONT};font-size:13px;font-weight:500;line-height:1.4;color:${L.muted};text-align:center;">
                      ${escapeHtml(params.expiresNote)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            detailsRows
              ? `<tr>
            <td style="padding:0;">
              ${sectionCard('Details', detailsRows)}
            </td>
          </tr>`
              : ''
          }
          ${securityHtml}
          <tr>
            <td style="padding:8px 4px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="stack theme-footer" valign="middle" style="font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${L.footer};vertical-align:middle;">
                    ${sectionIconSquare()}Bird Group
                  </td>
                  <td class="stack footer-right theme-footer-muted" align="right" valign="middle" style="font-family:${FONT};font-size:14px;font-weight:500;line-height:1.4;color:${L.footerMuted};text-align:right;vertical-align:middle;">
                    Generated automatically &middot; ${generatedDisplay}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildBrandedOtpEmailPlainText(
  params: BrandedOtpEmailParams,
): string {
  const lines = [
    String(params.title ?? '').trim() || 'One-time password',
    '',
    `OTP: ${String(params.otp ?? '')}`,
    params.expiresNote,
    '',
    '--- Details ---',
    ...(params.details ?? []).map(
      (row) => `${row.label}: ${String(row.value ?? '').trim() || '-'}`,
    ),
  ];
  if (params.securityNote) {
    lines.push('', params.securityNote);
  }
  return lines.join('\n');
}
