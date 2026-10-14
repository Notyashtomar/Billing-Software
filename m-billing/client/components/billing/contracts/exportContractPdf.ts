import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import type {
  BillingContract,
  BillingPriceCardAirline,
  BillingRateCard,
} from '@/lib/billing-shared/types';
import {
  CONTRACT_CONDITIONAL_CHARGE_SCENARIOS,
  CONTRACT_CONCESSION_SCENARIO_LABELS,
  formatContractCategory,
  formatPriceCardAirlineCategory,
} from '@/lib/billing-shared/enums';
import {
  formatConditionalChargeCell,
} from '@/lib/billing-shared/contract-concessions';
import {
  appliesToSummary,
  clausesFromContract,
  clauseTypeLabel,
} from '@/lib/billing-shared/contract-clauses';
import { collapseAdsEquipmentRules } from '@/lib/billing-shared/ads-equipment-rules-validity';
import {
  calendarYmd,
  countRateCardsForPriceCardEntry,
} from '@/lib/billing-shared/price-card-handling';
import { adsCatalogServiceDisplayName } from '@/lib/billing-shared/service-catalog-labels';
import { formatBillingDate, formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  getSessionStationHeader,
  getSessionStationLogoPath,
} from '@/lib/station-company-logo';

export type ContractPdfBhsExtras = {
  packageCards?: BillingPriceCardAirline[];
  rateCards?: BillingRateCard[];
  serviceCategoryByCode?: Map<string, string>;
};

export function selectBhsPackageCardsForContract(
  entries: BillingPriceCardAirline[],
  contract: BillingContract,
): BillingPriceCardAirline[] {
  const customer = String(contract.customerCode ?? '')
    .trim()
    .toUpperCase();
  if (!customer) return [];

  let rows = entries.filter(
    (e) =>
      e.handlingType === 'BHS' &&
      e.customerCode.trim().toUpperCase() === customer &&
      e.active !== false,
  );

  const aircraftSet = new Set(
    (contract.aircraftTypes ?? [])
      .map((a) => String(a).trim().toUpperCase())
      .filter(Boolean),
  );
  if (aircraftSet.size > 0) {
    const matched = rows.filter((e) =>
      aircraftSet.has(String(e.aircraftType ?? '').trim().toUpperCase()),
    );
    if (matched.length > 0) rows = matched;
  }

  const from = calendarYmd(contract.priceValidFrom);
  const to = calendarYmd(contract.priceValidTo);
  const overlapping = rows.filter((e) => {
    const rf = calendarYmd(e.validFrom);
    const rt = calendarYmd(e.validTo);
    return rf <= to && rt >= from;
  });
  if (overlapping.length > 0) rows = overlapping;

  return [...rows].sort((a, b) => {
    const ac = a.aircraftType.localeCompare(b.aircraftType);
    if (ac !== 0) return ac;
    return String(a.category).localeCompare(String(b.category));
  });
}

function money(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(value);
}

function contractEndingDaysLabel(priceValidTo: string | undefined): string {
  const raw = String(priceValidTo ?? '').trim();
  if (!raw) return '—';
  const ymdPart = raw.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymdPart);
  if (!match) return '—';
  const end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(end.getTime())) return '—';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const daysLeft = Math.round((endDay.getTime() - startOfToday.getTime()) / 86_400_000);

  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return ago === 1 ? 'Expired 1 day ago' : `Expired ${ago} days ago`;
  }
  if (daysLeft === 0) return 'Ends today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

function adsEquipmentName(serviceCode: string): string {
  const display = adsCatalogServiceDisplayName(serviceCode);
  return display || String(serviceCode ?? '').trim() || '—';
}

/** Include 0% rows in PDF (UI table still hides empty/zero). */
function formatSghaPdfCell(
  contract: BillingContract,
  key: (typeof CONTRACT_CONDITIONAL_CHARGE_SCENARIOS)[number],
): string {
  const direct = contract.conditionalCharges?.[key];
  if (direct != null && Number.isFinite(direct)) return `${direct}%`;
  if (
    key === 'returnToRamp' ||
    key === 'cancellationWithinHoursPercent' ||
    key === 'technicalHandlingChargesPercent' ||
    key === 'standbyChargesPercent'
  ) {
    const legacy = contract.concessionRates?.[key];
    if (legacy != null && Number.isFinite(legacy)) return `${legacy}%`;
  }
  return formatConditionalChargeCell(contract, key);
}

type PdfDoc = InstanceType<Awaited<ReturnType<typeof getJsPDFConstructor>>>;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 16;

const NAVY: [number, number, number] = [28, 7, 112];
const SLATE: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const SOFT: [number, number, number] = [248, 250, 252];
const WHITE: [number, number, number] = [255, 255, 255];

function ymd(value: string | undefined): string {
  return formatBillingDate(value);
}

function titleCaseStatus(status: string): string {
  return String(status || '—')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function wrapLines(doc: PdfDoc, text: string, width: number): string[] {
  return doc.splitTextToSize(String(text || ''), Math.max(8, width)) as string[];
}

async function loadStationLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(getSessionStationLogoPath());
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function logoFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'JPEG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'PNG';
}

/** Measure natural image size from a data URL (browser only). */
function measureImageSize(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Fit logo into max box while keeping aspect ratio (avoids stretch). */
function fitLogoSize(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const ratio = naturalW / naturalH;
  let height = maxH;
  let width = height * ratio;
  if (width > maxW) {
    width = maxW;
    height = width / ratio;
  }
  return { width, height };
}

class ContractPdfLayout {
  doc: PdfDoc;
  y = MARGIN;
  page = 1;
  companyName = 'Bird Airport Services Private Limited';
  stationLine = '';

  constructor(doc: PdfDoc) {
    this.doc = doc;
    const header = getSessionStationHeader();
    this.companyName = header.companyName;
    this.stationLine = header.stationLine;
  }

  ensure(need: number): void {
    if (this.y + need <= BOTTOM) return;
    this.addFooter();
    this.doc.addPage();
    this.page += 1;
    this.y = MARGIN;
    this.drawContinuationHeader();
  }

  drawContinuationHeader(): void {
    this.doc.setFillColor(...NAVY);
    this.doc.rect(0, 0, PAGE_W, 8, 'F');
    this.doc.setTextColor(...WHITE);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.text(this.companyName, MARGIN, 5.4);
    this.y = 14;
  }

  addFooter(): void {
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(...MUTED);
    this.doc.text(`${this.companyName} · Contract summary`, MARGIN, PAGE_H - 7);
    this.doc.text(`Page ${this.page}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
  }

  async header(contract: BillingContract, logoDataUrl: string | null): Promise<void> {
    const bandH = 48;
    const centerX = PAGE_W / 2;
    this.doc.setFillColor(...WHITE);
    this.doc.rect(0, 0, PAGE_W, bandH, 'F');

    // Left: larger logo (aspect preserved)
    if (logoDataUrl) {
      try {
        const natural = await measureImageSize(logoDataUrl);
        const { width: logoW, height: logoH } = natural
          ? fitLogoSize(natural.width, natural.height, 52, 22)
          : { width: 40, height: 18 };
        const logoY = (bandH - 2.2 - logoH) / 2;
        this.doc.addImage(
          logoDataUrl,
          logoFormat(logoDataUrl),
          MARGIN,
          Math.max(6, logoY),
          logoW,
          logoH,
        );
      } catch {
        // Continue without logo if image decode fails.
      }
    }

    // Center: company + document heading
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(...NAVY);
    this.doc.text(this.companyName, centerX, 14, { align: 'center' });

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(15);
    this.doc.setTextColor(...SLATE);
    this.doc.text('Handling Contract Summary', centerX, 24, { align: 'center' });

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...MUTED);
    this.doc.text(
      this.stationLine ? `${this.stationLine} · Filled agreement details` : 'Filled agreement details',
      centerX,
      31.5,
      { align: 'center' },
    );

    // Right: contract identity
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(...NAVY);
    this.doc.text(contract.contractNumber || '—', PAGE_W - MARGIN, 18, { align: 'right' });
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(...MUTED);
    this.doc.text(titleCaseStatus(contract.status), PAGE_W - MARGIN, 25, { align: 'right' });

    this.doc.setFillColor(...NAVY);
    this.doc.rect(0, bandH, PAGE_W, 2.2, 'F');
    this.y = bandH + 10;
  }

  sectionTitle(title: string): void {
    this.ensure(14);
    this.doc.setFillColor(...NAVY);
    this.doc.rect(MARGIN, this.y, 2.2, 6.5, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(...NAVY);
    this.doc.text(title, MARGIN + 5, this.y + 5);
    this.y += 11;
  }

  emptyNote(text: string): void {
    this.ensure(10);
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(9);
    this.doc.setTextColor(...MUTED);
    this.doc.text(text, MARGIN, this.y + 4);
    this.y += 10;
  }

  keyValueGrid(rows: Array<[string, string]>): void {
    const colGap = 4;
    const colW = (CONTENT_W - colGap) / 2;
    const labelValueGap = 3;
    const minValueW = 18;
    const rowH = 9;

    for (let i = 0; i < rows.length; i += 2) {
      this.ensure(rowH + 2);
      const pair = [rows[i], rows[i + 1]].filter(Boolean) as Array<[string, string]>;

      this.doc.setFillColor(...(i % 4 === 0 ? SOFT : WHITE));
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.2);
      this.doc.roundedRect(MARGIN, this.y, CONTENT_W, rowH, 1.2, 1.2, 'FD');

      pair.forEach(([label, value], idx) => {
        const x = MARGIN + idx * (colW + colGap);
        const labelText = label.toUpperCase();

        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(8);
        this.doc.setTextColor(...MUTED);
        const labelW = Math.min(
          this.doc.getTextWidth(labelText) + 0.6,
          colW - minValueW - labelValueGap - 4,
        );
        this.doc.text(labelText, x + 2.5, this.y + 5.5);

        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(9.5);
        this.doc.setTextColor(...SLATE);
        const valueX = x + 2.5 + labelW + labelValueGap;
        const valueW = Math.max(minValueW, colW - (valueX - x) - 2);
        const lines = wrapLines(this.doc, value, valueW);
        this.doc.text(lines[0] ?? '—', valueX, this.y + 5.5);
      });

      this.y += rowH + 1.5;
    }
  }

  simpleTable(headers: string[], body: string[][], widths: number[]): void {
    const headerH = 8;
    const padX = 2;

    const drawHeader = () => {
      this.ensure(headerH + 4);
      this.doc.setFillColor(...NAVY);
      this.doc.rect(MARGIN, this.y, CONTENT_W, headerH, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...WHITE);
      let x = MARGIN;
      headers.forEach((h, i) => {
        this.doc.text(h, x + padX, this.y + 5.3);
        x += widths[i];
      });
      this.y += headerH;
    };

    drawHeader();

    body.forEach((row, rowIndex) => {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8.5);
      const lineHeights = row.map((cell, i) => {
        const lines = wrapLines(this.doc, cell, widths[i] - padX * 2);
        return Math.max(1, lines.length);
      });
      const maxLines = Math.max(...lineHeights);
      const rowH = Math.max(7.5, maxLines * 4 + 3.5);
      this.ensure(rowH + 2);

      // Re-draw header if we just flipped page
      if (this.y <= MARGIN + 2) drawHeader();

      this.doc.setFillColor(...(rowIndex % 2 === 0 ? WHITE : SOFT));
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.2);
      this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, 'FD');

      this.doc.setTextColor(...SLATE);
      let x = MARGIN;
      row.forEach((cell, i) => {
        const lines = wrapLines(this.doc, cell, widths[i] - padX * 2);
        lines.forEach((line, li) => {
          this.doc.text(line, x + padX, this.y + 4.6 + li * 4);
        });
        x += widths[i];
      });
      this.y += rowH;
    });

    this.y += 4;
  }

  clauseCards(
    clauses: Array<{ title: string; applies: string; body: string }>,
  ): void {
    for (const clause of clauses) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      const bodyLines = wrapLines(this.doc, clause.body, CONTENT_W - 8);
      const cardH = 14 + bodyLines.length * 4.2;
      this.ensure(cardH + 3);

      this.doc.setFillColor(...WHITE);
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.35);
      this.doc.roundedRect(MARGIN, this.y, CONTENT_W, cardH, 1.5, 1.5, 'FD');
      this.doc.setFillColor(...NAVY);
      this.doc.rect(MARGIN, this.y, 1.8, cardH, 'F');

      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(...NAVY);
      this.doc.text(clause.title, MARGIN + 5, this.y + 5.5);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(clause.applies, MARGIN + 5, this.y + 10.5);

      this.doc.setFontSize(9);
      this.doc.setTextColor(...SLATE);
      bodyLines.forEach((line, i) => {
        this.doc.text(line, MARGIN + 5, this.y + 16 + i * 4.2);
      });

      this.y += cardH + 3;
    }
  }
}

/** Build a printable PDF summary of the filled contract (not the uploaded attachment). */
export async function exportFilledContractPdf(
  contract: BillingContract,
  bhs?: ContractPdfBhsExtras,
): Promise<void> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const layout = new ContractPdfLayout(doc);
  const logoDataUrl = await loadStationLogoDataUrl();

  await layout.header(contract, logoDataUrl);

  const aircraft =
    (contract.aircraftTypes ?? [])
      .map((a) => String(a).trim().toUpperCase())
      .filter(Boolean)
      .join(', ') || '—';

  layout.sectionTitle('General');
  layout.keyValueGrid([
    ['Contract #', contract.contractNumber || '—'],
    ['Airline', contract.customerCode || '—'],
    ['Station', contract.stationCode || '—'],
    ['Category', formatContractCategory(contract.category)],
    ['Status', titleCaseStatus(contract.status)],
    ['Valid from', ymd(contract.priceValidFrom)],
    ['Valid to', ymd(contract.priceValidTo)],
    ['Contract ending', contractEndingDaysLabel(contract.priceValidTo)],
    ['Aircraft', aircraft],
    [
      'ADS rules',
      contract.adsBillingEnabled ? 'Enabled' : 'Disabled',
    ],
  ]);

  layout.sectionTitle('SGHA terms');
  const sghaRows: string[][] = [];
  for (const key of CONTRACT_CONDITIONAL_CHARGE_SCENARIOS) {
    sghaRows.push([
      CONTRACT_CONCESSION_SCENARIO_LABELS[key],
      formatSghaPdfCell(contract, key),
    ]);
  }
  sghaRows.push([
    'Cancel window',
    contract.cancellationWithinHours != null &&
    Number.isFinite(contract.cancellationWithinHours)
      ? `${contract.cancellationWithinHours} hours`
      : '—',
  ]);
  layout.simpleTable(['Term', 'Value'], sghaRows, [CONTENT_W * 0.72, CONTENT_W * 0.28]);

  layout.sectionTitle('Clauses');
  const clauses = clausesFromContract(contract)
    .filter((c) => String(c.body ?? '').trim())
    .map((c) => ({
      title: c.label?.trim() || clauseTypeLabel(c.clauseType),
      applies: `Applies to: ${appliesToSummary(c.appliesTo ?? ['all'])}`,
      body: String(c.body ?? '').trim(),
    }));
  if (clauses.length === 0) {
    layout.emptyNote('No clauses configured.');
  } else {
    layout.clauseCards(clauses);
  }

  layout.sectionTitle(`BHS rate card — ${contract.customerCode || 'Airline'}`);
  const packageCards = bhs?.packageCards ?? [];
  const rateCards = bhs?.rateCards ?? [];
  const serviceCategoryByCode = bhs?.serviceCategoryByCode ?? new Map<string, string>();
  if (packageCards.length === 0) {
    layout.emptyNote('No BHS rate cards found for this airline.');
  } else {
    layout.simpleTable(
      ['Aircraft', 'Category', 'Price', 'Services', 'Valid from', 'Valid to'],
      packageCards.map((row) => [
        String(row.aircraftType || '—'),
        formatPriceCardAirlineCategory(row.category),
        money(row.price),
        String(
          countRateCardsForPriceCardEntry(
            rateCards,
            'BHS',
            row,
            serviceCategoryByCode,
          ),
        ),
        ymd(row.validFrom),
        ymd(row.validTo),
      ]),
      [
        CONTENT_W * 0.16,
        CONTENT_W * 0.16,
        CONTENT_W * 0.14,
        CONTENT_W * 0.14,
        CONTENT_W * 0.2,
        CONTENT_W * 0.2,
      ],
    );
  }

  layout.sectionTitle('ADS equipment rules');
  if (!contract.adsBillingEnabled) {
    layout.emptyNote('ADS billing rules are disabled on this contract.');
  } else {
    const rules = collapseAdsEquipmentRules(contract.adsEquipmentRules ?? []).filter((r) =>
      String(r.serviceCode ?? '').trim(),
    );
    if (rules.length === 0) {
      layout.emptyNote('No ADS equipment rules configured.');
    } else {
      const adsBody = rules.map((rule) => {
        const aircraftTypes =
          (rule.aircraftTypes ?? []).join(', ') ||
          rule.aircraftType?.trim() ||
          'All';
        return [
          adsEquipmentName(String(rule.serviceCode ?? '')),
          rule.includedForAds === false ? 'No' : 'Yes',
          String(rule.freePerFlight ?? 0),
          rule.alwaysChargeable ? 'Yes' : 'No',
          rule.uom || 'EA',
          rule.unitPriceINR != null ? String(rule.unitPriceINR) : '—',
          rule.unitPriceUSD != null ? String(rule.unitPriceUSD) : '—',
          aircraftTypes,
        ];
      });
      layout.simpleTable(
        ['Equipment', 'Incl.', 'FOC', 'Always', 'UOM', 'INR', 'USD', 'Aircraft'],
        adsBody,
        [
          CONTENT_W * 0.24,
          CONTENT_W * 0.08,
          CONTENT_W * 0.08,
          CONTENT_W * 0.09,
          CONTENT_W * 0.1,
          CONTENT_W * 0.1,
          CONTENT_W * 0.1,
          CONTENT_W * 0.21,
        ],
      );
    }
  }

  layout.ensure(10);
  layout.doc.setFont('helvetica', 'normal');
  layout.doc.setFontSize(8);
  layout.doc.setTextColor(...MUTED);
  layout.doc.text(
    `Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    MARGIN,
    layout.y + 2,
  );

  layout.addFooter();

  const safeName = String(contract.contractNumber || 'contract')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  doc.save(`${safeName || 'contract'}-summary.pdf`);
}
