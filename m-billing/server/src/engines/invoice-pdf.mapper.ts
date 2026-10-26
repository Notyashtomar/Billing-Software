import { amountInWordsInr, amountInWordsUsd } from './amount-in-words';
import {
  CHENNAI_INVOICE_DEFAULTS,
  panFromGstin,
  resolveAirportConfig,
  resolveCustomerBillToDefaults,
  resolveInvoiceBankDefaults,
  resolveInvoiceCompanyDefaults,
} from './invoice-pdf.defaults';
import type { InvoicePdfInput, InvoicePdfLineInput } from './invoice-pdf.types';
import {
  calculateInvoiceConcessionTotals,
  isCeilingParticularLine,
  roundBillingMoney,
  type InvoiceConcessionTotals,
} from '../utils/invoice-concession.util';
import {
  pickCategoryOfFlight,
  resolveInvoiceFlightCategory,
} from '../utils/invoice-flight-category.util';
import { toBillingYearMonth } from './currency-engine.service';

type InvoiceHeaderLike = {
  invoiceNumber?: string;
  draftNumber: string;
  customerCode: string;
  customerName: string;
  customerAddress?: string;
  documentDate: Date | string;
  currencyCode: string;
  currencyFactor?: number;
  totalReceivableInUsd?: boolean;
  subtotalExclTax: number;
  taxTotal: number;
  totalInclTax: number;
  billingPeriodStart: Date | string;
  billingPeriodEnd: Date | string;
  stationCode: string;
  invoiceCategory?: string;
  customBillOverrides?: {
    billToGstin?: string;
    billToPan?: string;
    billToStateCode?: string;
    placeOfSupply?: string;
    serviceStation?: string;
    serviceTableTitle?: string;
  };
};

type InvoiceLineLike = {
  lineNo: number;
  description: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  lineAmountExclTax: number;
  lineAmountInclTax: number;
  serviceCode: string;
  sourceType?: string;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  gstPercent?: number;
  sourceRef?: Record<string, unknown>;
};

type SettingsLike = {
  gstStateCode?: string;
  companyLegalEntity?: {
    name?: string;
    address?: string;
    gstin?: string;
    pan?: string;
    cin?: string;
    phone?: string;
  };
  bankDetails?: {
    bankName?: string;
    branchAddress?: string;
    beneficiaryName?: string;
    accountNumber?: string;
    swiftCode?: string;
    ifscCode?: string;
    micr?: string;
  };
};

type CustomerLike = {
  name?: string;
  airlineInvoiceName?: string;
  address?: string;
  gstRegistrationNo?: string;
  globalDimension1?: string;
  globalDimension2?: string;
  secondaryAddressEnabled?: boolean;
  secondaryAddress?: string;
  /** When true, print PAN on the invoice. */
  showPanOnInvoice?: boolean;
  panNumber?: string;
  /** When true, print VAT number on the invoice. */
  showVatOnInvoice?: boolean;
  vatNumber?: string;
};

type ServiceCatalogLike = {
  serviceCode: string;
  sacCode?: string;
  category?: string;
};

function formatInvoiceDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

const MONTH_YEAR_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function utcCalendarParts(value: Date | string | null | undefined): {
  year: number;
  monthIndex: number;
  day: number;
} | null {
  if (value == null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getUTCFullYear(),
    monthIndex: parsed.getUTCMonth(),
    day: parsed.getUTCDate(),
  };
}

/**
 * Tax invoice "For the Period".
 * Monthly invoices stay month + year (July 2026); multi-month stays March - July 2026.
 * Fortnight invoices show the billed part, e.g. [1-15] Aug 2026.
 */
export function formatBillingPeriodLabel(
  start: Date | string,
  end?: Date | string,
  options?: { fortnight?: boolean },
): string {
  const startYm = toBillingYearMonth(start);
  const endYm = toBillingYearMonth(end ?? null) || startYm;
  if (!startYm) return '';

  const formatYm = (ym: string): string => {
    const [yearRaw, monthRaw] = ym.split('-');
    const monthIdx = Number(monthRaw) - 1;
    const year = Number(yearRaw);
    if (!Number.isFinite(year) || monthIdx < 0 || monthIdx > 11) return '';
    return `${MONTH_YEAR_NAMES[monthIdx]} ${year}`;
  };

  if (options?.fortnight && end) {
    const startParts = utcCalendarParts(start);
    const endParts = utcCalendarParts(end);
    if (
      startParts &&
      endParts &&
      startParts.year === endParts.year &&
      startParts.monthIndex === endParts.monthIndex &&
      startParts.day >= 1 &&
      endParts.day >= startParts.day
    ) {
      const month = MONTH_SHORT_NAMES[startParts.monthIndex];
      return `[${startParts.day}-${endParts.day}] ${month} ${startParts.year}`;
    }
  }

  const startLabel = formatYm(startYm);
  if (!startLabel) return '';
  if (!endYm || endYm === startYm) return startLabel;
  const endLabel = formatYm(endYm);
  if (!endLabel) return startLabel;
  return `${startLabel.replace(/ \d{4}$/, '')} - ${endLabel}`;
}

function splitAddress(address?: string): string[] {
  if (!address?.trim()) return [];
  return address
    .split(/\r?\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickRef(ref: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!ref) return undefined;
  for (const key of keys) {
    const v = ref[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function formatInvoiceUom(value: string | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.toUpperCase() === 'EA') return 'Per Flight';
  return raw;
}

const HANDLING_PARTICULAR =
  /^Charges for .+ handling(?: \[[^\]]+\])*$/i;

/** Drop a stored package rate (`@ 160425`) from a handling particular. */
function stripTurnaroundPackageRate(description: string): string {
  return description
    .replace(
      /^(Charges for .+ handling(?: \[[^\]]+\])*) @ [\d,]+(?:\.\d+)?$/i,
      '$1',
    )
    .trim();
}

/** BHS lines keep the type-of-flight particular. Older drafts still say Turnaround. */
function resolvePdfLineDescription(line: InvoiceLineLike): string {
  const stored = String(line.description ?? '').trim();
  const withoutRate = stripTurnaroundPackageRate(stored);
  const code = String(line.serviceCode ?? '').trim();
  if (/^scheduled\s*flight$/i.test(code) || /^trnd$/i.test(code) || /^bhs$/i.test(code)) {
    if (HANDLING_PARTICULAR.test(withoutRate)) return withoutRate;
    return 'Charges for Turnaround handling';
  }
  return withoutRate || '';
}

function mapLine(
  line: InvoiceLineLike,
  sacByService: Map<string, string>,
  roe?: number,
  isUsd?: boolean,
): InvoicePdfLineInput {
  const ref = line.sourceRef ?? {};
  const snap = (ref.operationalSnapshot as Record<string, unknown> | undefined) ?? ref;
  const categoryHint =
    normalizeInvoiceCategoryCode(line.sourceType) ??
    normalizeInvoiceCategoryCode(String(ref.invoiceCategory ?? '')) ??
    normalizeInvoiceCategoryCode(line.serviceCode);
  const isRafLine = categoryHint === 'RAF';
  const isAdsLine =
    !isRafLine &&
    (categoryHint === 'ADS' ||
      Boolean(ref.chargedQuantity != null || ref.freeAllowance != null));

  const usedRaw = positiveNumber(
    pickRef(ref, 'usedQuantity', 'used', 'qtyUsed') ??
      pickRef(snap, 'used', 'usedQty') ??
      (line.quantity > 0 ? line.quantity : undefined),
  );
  const used =
    usedRaw == null
      ? undefined
      : isRafLine
        ? round2(usedRaw)
        : Math.max(1, Math.round(usedRaw));
  const aircraftType = pickRef(ref, 'aircraftType', 'aircraft') ?? pickRef(snap, 'aircraftType', 'aircraft', 'ACType');
  const amount = line.lineAmountExclTax > 0 ? line.lineAmountExclTax : 0;
  const storedUnitPrice = line.unitPrice > 0 ? line.unitPrice : 0;
  const packageRate = positiveNumber(ref.bhsPackageRate) ?? storedUnitPrice;
  const flightQty = line.quantity > 0 ? line.quantity : 0;
  const concessionAppliedToUnitPrice = ref.concessionAppliedToUnitPrice === true;

  let charged: number;
  let unitPrice: number;
  if (isAdsLine) {
    const chargedRaw =
      positiveNumber(pickRef(ref, 'chargedQuantity', 'charged')) ?? flightQty;
    charged = Math.max(0, Math.round(chargedRaw));
    unitPrice = storedUnitPrice;
  } else if (isRafLine) {
    const chargedRaw =
      positiveNumber(pickRef(ref, 'chargedQuantity', 'charged')) ?? flightQty;
    charged = round2(chargedRaw);
    unitPrice = storedUnitPrice;
  } else if (concessionAppliedToUnitPrice && packageRate > 0) {
    // When chargeable %, keep Rate/Unit as full package and show Charged as factor (e.g. 50% → 0.5).
    charged = round2((flightQty * storedUnitPrice) / packageRate);
    unitPrice = packageRate;
  } else {
    charged = flightQty;
    unitPrice = storedUnitPrice;
  }

  const base: InvoicePdfLineInput = {
    lineNo: line.lineNo,
    description: resolvePdfLineDescription(line),
    used,
    charged,
    aircraftType,
    uom: isAdsLine || isRafLine
      ? String(line.uom ?? 'Per Service').trim() || 'Per Service'
      : formatInvoiceUom(line.uom),
    unitPrice,
    amount,
    serviceCode: isAdsLine ? 'ADS' : isRafLine ? 'RAF' : line.serviceCode?.trim() || undefined,
    sacCode: isAdsLine
      ? sacByService.get('ADS') ||
        sacByService.get(
          String(ref.equipmentServiceCode ?? snap.equipmentServiceCode ?? '').trim(),
        ) ||
        undefined
      : isRafLine
        ? sacByService.get('RAF') ||
          sacByService.get(String(ref.particular ?? line.description ?? '').trim()) ||
          sacByService.get(line.serviceCode) ||
          undefined
        : sacByService.get(line.serviceCode) || undefined,
  };
  if (isUsd && roe && amount > 0) {
    base.amountUsd = amount;
    base.amountInr = round2(amount * roe);
  } else if (!isUsd && roe && roe > 1 && amount > 0) {
    base.amountInr = amount;
    base.amountUsd = round2(amount / roe);
  }
  return base;
}

function normalizeInvoiceCategoryCode(value?: string): 'BHS' | 'ADS' | 'RAF' | 'MAAS' | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'BHS' || raw.includes('SCHEDULED FLIGHT')) return 'BHS';
  if (raw === 'MAAS' || raw.includes('MAAS') || raw.includes('MEET')) return 'MAAS';
  if (
    raw === 'CUSTOM' ||
    raw.includes('CUSTOM BILLING') ||
    raw === 'ADS' ||
    raw.includes('ADS') ||
    raw === 'EQUIPMENT' ||
    raw === 'MANPOWER' ||
    raw.includes('EQUIPMENT') ||
    raw.includes('MANPOWER')
  ) {
    return 'ADS';
  }
  if (raw === 'RAF' || raw.includes('RAF')) return 'RAF';
  return null;
}

function resolveInvoiceServiceCode(
  lines: InvoiceLineLike[],
  fallback: string,
): string {
  for (const line of lines) {
    const direct = normalizeInvoiceCategoryCode(line.serviceCode);
    if (direct) return direct;
  }
  for (const line of lines) {
    const fromSourceType = normalizeInvoiceCategoryCode(line.sourceType);
    if (fromSourceType) return fromSourceType;
  }
  for (const line of lines) {
    const fromRef = normalizeInvoiceCategoryCode(
      (line.sourceRef as Record<string, unknown> | undefined)?.sourceType as string | undefined,
    );
    if (fromRef) return fromRef;
  }
  return fallback;
}

function resolveInvoiceStateCode(
  settings: SettingsLike | null | undefined,
  companyGstin?: string,
): string | undefined {
  const configured = settings?.gstStateCode?.trim();
  if (configured) return configured;
  return extractStateCode(companyGstin);
}

function extractStateCode(gstin?: string): string | undefined {
  if (!gstin || gstin.length < 2) return undefined;
  return gstin.slice(0, 2);
}

function resolveBillTo(customer: CustomerLike | null | undefined) {
  const customerGstin = customer?.gstRegistrationNo?.trim() || undefined;
  const addressSource =
    customer?.address?.trim() || customer?.globalDimension2?.trim() || undefined;
  const showPan = customer?.showPanOnInvoice === true;
  const showVat = customer?.showVatOnInvoice === true;
  const storedPan = customer?.panNumber?.trim().toUpperCase() || undefined;
  const storedVat = customer?.vatNumber?.trim().toUpperCase() || undefined;
  return {
    name: customer?.airlineInvoiceName?.trim() || customer?.name?.trim() || '',
    addressLines: splitAddress(addressSource),
    secondaryAddressLines: undefined as string[] | undefined,
    gstin: customerGstin,
    pan: showPan ? storedPan || panFromGstin(customerGstin) : undefined,
    vat: showVat ? storedVat : undefined,
    stateCode: extractStateCode(customerGstin),
  };
}

function amountWordsInr(total: number): string {
  if (!total || total <= 0) return '';
  return amountInWordsInr(total);
}

export type BuildInvoicePdfInputParams = {
  header: InvoiceHeaderLike;
  lines: InvoiceLineLike[];
  settings?: SettingsLike | null;
  customer?: CustomerLike | null;
  serviceCatalog?: ServiceCatalogLike[];
  /** Active contract category ('Dom' | 'Int') — fallback for legacy invoice lines. */
  contractCategory?: string;
  concessionFeePercent?: number;
  concessionTotals?: InvoiceConcessionTotals;
  irn?: string;
  hasAnnexures?: boolean;
  serviceTableTitle?: string;
  /** Fortnight contract — "For the Period" prints the billed day range. */
  fortnightBilling?: boolean;
  /** Contract categories that print USD and INR together. */
  inrUsdInvoiceCategories?: string[];
};

export function buildInvoicePdfInput(params: BuildInvoicePdfInputParams): InvoicePdfInput {
  const { header, lines, settings, customer, serviceCatalog } = params;
  const sacByService = new Map(
    (serviceCatalog ?? []).map((s) => [s.serviceCode, s.sacCode ?? '']),
  );
  const isUsd = header.currencyCode === 'USD';
  const usdReceivable = isUsd && Boolean(header.totalReceivableInUsd);
  const roe = positiveNumber(header.currencyFactor);
  const mappedLines = lines
    .filter((line) => !isCeilingParticularLine(line))
    .map((l) => mapLine(l, sacByService, roe && (isUsd || roe > 1) ? roe : undefined, isUsd));
  const subtotalExclTax =
    header.subtotalExclTax > 0
      ? header.subtotalExclTax
      : mappedLines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);

  const concessionFeePercent =
    params.concessionTotals?.concessionFeePercent ??
    (params.concessionFeePercent !== undefined
      ? params.concessionFeePercent
      : isUsd
        ? CHENNAI_INVOICE_DEFAULTS.concessionFeePercentUsd
        : CHENNAI_INVOICE_DEFAULTS.concessionFeePercentInr);
  const concessionTotals =
    params.concessionTotals ??
    calculateInvoiceConcessionTotals(subtotalExclTax, concessionFeePercent, {
      currencyCode: header.currencyCode,
      currencyFactor: header.currencyFactor,
      totalReceivableInUsd: header.totalReceivableInUsd,
    });
  const concessionFeeAmount = concessionTotals.concessionFeeAmount;
  const grossAmount = concessionTotals.grossAmount;
  const grossAmountInr = concessionTotals.grossAmountInr;
  const cgstAmount = concessionTotals.cgstAmount;
  const sgstAmount = concessionTotals.sgstAmount;
  const igstAmount = 0;
  const cgstPercent = concessionTotals.cgstPercent;
  const sgstPercent = concessionTotals.sgstPercent;

  const companyDefaults = resolveInvoiceCompanyDefaults(
    header.stationCode,
    settings?.companyLegalEntity,
  );
  const bankDetails = resolveInvoiceBankDefaults(header.stationCode, settings?.bankDetails);
  const airport = resolveAirportConfig(header.stationCode);
  const catalogSac = mappedLines.find((l) => l.sacCode)?.sacCode;
  const headerCategory = normalizeInvoiceCategoryCode(header.invoiceCategory);
  const headerCatRaw = String(header.invoiceCategory ?? '').trim().toUpperCase();
  const lineServiceCode =
    headerCategory === 'ADS' || headerCatRaw === 'CUSTOM'
      ? 'ADS'
      : resolveInvoiceServiceCode(lines, airport.serviceCode);
  const sacCode = catalogSac || airport.sacCode;
  const serviceCode = lineServiceCode || airport.serviceCode;

  const billTo = resolveBillTo(customer);
  const airlineInvoiceName = customer?.airlineInvoiceName?.trim();
  if (airlineInvoiceName && !header.customBillOverrides) {
    billTo.name = airlineInvoiceName;
  } else if (header.customerName?.trim()) {
    billTo.name = header.customerName.trim();
  }
  const secondaryOn =
    customer?.secondaryAddressEnabled === true && Boolean(customer.secondaryAddress?.trim());
  if (secondaryOn) {
    const secondaryRaw = customer?.secondaryAddress?.trim() ?? '';
    let primarySource =
      customer?.address?.trim() || customer?.globalDimension2?.trim() || '';
    const joinedSuffix = `\n${secondaryRaw}`;
    if (secondaryRaw && primarySource.endsWith(joinedSuffix)) {
      primarySource = primarySource.slice(0, -joinedSuffix.length).trim();
    }
    if (primarySource) billTo.addressLines = splitAddress(primarySource);
    billTo.secondaryAddressLines = splitAddress(secondaryRaw);
  } else if (header.customerAddress?.trim()) {
    billTo.addressLines = splitAddress(header.customerAddress);
  } else if (!billTo.addressLines.length) {
    const staticBillTo = resolveCustomerBillToDefaults(
      header.stationCode,
      header.customerCode,
      customer?.name ?? header.customerName,
    );
    if (staticBillTo?.addressLines.length) {
      billTo.addressLines = staticBillTo.addressLines;
    }
  }
  billTo.stateCode = resolveInvoiceStateCode(settings, companyDefaults.gstin);

  const overrides = header.customBillOverrides;
  const showCustomerPan = customer?.showPanOnInvoice === true;
  const showCustomerVat = customer?.showVatOnInvoice === true;
  const storedPan = customer?.panNumber?.trim().toUpperCase();
  if (overrides?.billToGstin?.trim()) {
    billTo.gstin = overrides.billToGstin.trim();
    if (overrides.billToPan?.trim()) {
      billTo.pan = overrides.billToPan.trim();
    } else if (showCustomerPan) {
      billTo.pan = storedPan || panFromGstin(billTo.gstin);
    } else {
      billTo.pan = undefined;
    }
  } else if (overrides?.billToPan?.trim()) {
    billTo.pan = overrides.billToPan.trim();
  } else if (!showCustomerPan) {
    billTo.pan = undefined;
  }
  if (!showCustomerPan) billTo.pan = undefined;
  if (!showCustomerVat) {
    billTo.vat = undefined;
  }
  if (overrides?.billToStateCode?.trim()) {
    billTo.stateCode = overrides.billToStateCode.trim();
  }

  const serviceTableTitleResolved =
    overrides?.serviceTableTitle?.trim() ||
    params.serviceTableTitle?.trim() ||
    lines.find((l) => l.description?.trim())?.description?.trim() ||
    'Charges for Passenger and Ramp Handling Services';

  const placeOfSupplyResolved =
    overrides?.placeOfSupply?.trim() || airport.placeOfSupply;
  const serviceStationResolved =
    overrides?.serviceStation?.trim() || airport.serviceStation;

  let dual: Partial<InvoicePdfInput> = {};
  const invoiceCategory = String(header.invoiceCategory ?? '').trim().toUpperCase();
  const dualCurrencyLayout =
    isUsd &&
    Boolean(roe) &&
    (params.inrUsdInvoiceCategories ?? [])
      .map((category) => category.trim().toUpperCase())
      .includes(invoiceCategory);

  if (dualCurrencyLayout && roe) {
    let subtotalInr = 0;
    for (const line of mappedLines) {
      const inr = round2(line.amount * roe);
      line.amountInr = inr;
      subtotalInr = round2(subtotalInr + inr);
    }
    const ratio = subtotalExclTax > 0 ? concessionFeeAmount / subtotalExclTax : 0;
    const concessionInr = round2(subtotalInr * ratio);
    const grossUsd = round2(subtotalExclTax + concessionFeeAmount);
    const grossInrSide = round2(subtotalInr + concessionInr);
    const cgstPct = cgstPercent > 0 ? cgstPercent : cgstAmount > 0 ? 9 : 0;
    const sgstPct = sgstPercent > 0 ? sgstPercent : sgstAmount > 0 ? 9 : 0;
    const cgstUsdSide = round2(grossUsd * (cgstPct / 100));
    const sgstUsdSide = round2(grossUsd * (sgstPct / 100));
    const cgstInrSide = round2(grossInrSide * (cgstPct / 100));
    const sgstInrSide = round2(grossInrSide * (sgstPct / 100));
    const totalUsdSide = round2(grossUsd + cgstUsdSide + sgstUsdSide);
    const totalInrSide = round2(grossInrSide + cgstInrSide + sgstInrSide);
    dual = {
      dualCurrencyLayout: true,
      exchangeRate: roe,
      subtotalUsd: round2(subtotalExclTax),
      subtotalInr,
      concessionFeeUsd: round2(concessionFeeAmount),
      concessionFeeInr: concessionInr,
      grossAmountUsd: grossUsd,
      grossAmountInr: grossInrSide,
      cgstUsd: cgstUsdSide,
      sgstUsd: sgstUsdSide,
      cgstInr: cgstInrSide,
      sgstInr: sgstInrSide,
      totalReceivableUsd: totalUsdSide,
      totalReceivableInr: totalInrSide,
      amountInWordsUsd: totalUsdSide > 0 ? amountInWordsUsd(totalUsdSide) : '',
      amountInWordsInr: totalInrSide > 0 ? amountWordsInr(totalInrSide) : '',
    };
  }

  /**
   * Fields 1–5 stay in billing currency.
   * Default USD path: FX to INR for tax base; receivable in INR.
   * USD receivable path: CGST/SGST + receivable in USD (no INR conversion row).
   */
  if (!dualCurrencyLayout && isUsd && subtotalExclTax > 0) {
    const subtotalUsd = round2(subtotalExclTax);
    const concessionFeeUsd = round2(concessionFeeAmount);
    const grossUsd = round2(grossAmount);
    if (usdReceivable) {
      const cgstUsd = round2(cgstAmount);
      const sgstUsd = round2(sgstAmount);
      const totalReceivableUsd = round2(concessionTotals.totalInclTax);
      dual = {
        subtotalUsd,
        concessionFeeUsd,
        grossAmountUsd: grossUsd,
        cgstUsd,
        sgstUsd,
        totalReceivableUsd,
        amountInWordsUsd:
          totalReceivableUsd > 0 ? amountInWordsUsd(totalReceivableUsd) : '',
      };
    } else if (roe) {
      const grossInr = round2(grossAmountInr);
      const cgstInr = round2(cgstAmount);
      const sgstInr = round2(sgstAmount);
      const totalReceivableInr = round2(concessionTotals.totalInclTax);
      dual = {
        exchangeRate: roe,
        subtotalUsd,
        concessionFeeUsd,
        grossAmountUsd: grossUsd,
        grossAmountInr: grossInr,
        cgstInr,
        sgstInr,
        totalReceivableInr,
        amountInWordsInr: totalReceivableInr > 0 ? amountWordsInr(totalReceivableInr) : '',
      };
    }
  }

  const totalInclTax = round2(concessionTotals.totalInclTax);

  const flightCategory = inferFlightCategory(lines, serviceCatalog, params.contractCategory);
  const irn = params.irn?.trim() || undefined;

  return {
    title: 'TAX INVOICE',
    irn,
    company: {
      name: companyDefaults.name,
      addressLines: splitAddress(companyDefaults.address),
      gstin: companyDefaults.gstin,
      cin: companyDefaults.cin,
      phone: companyDefaults.phone,
      pan: companyDefaults.pan,
    },
    invoiceNumber: header.invoiceNumber?.trim() || header.draftNumber,
    invoiceDate: formatInvoiceDate(header.documentDate),
    billTo,
    serviceDescription: airport.serviceDescription,
    serviceTableTitle: serviceTableTitleResolved,
    flightCategory: flightCategory || undefined,
    billingPeriodLabel: formatBillingPeriodLabel(
      header.billingPeriodStart,
      header.billingPeriodEnd,
      { fortnight: params.fortnightBilling === true },
    ),
    serviceStation: serviceStationResolved,
    placeOfSupply: placeOfSupplyResolved,
    state: airport.state,
    sacCode,
    serviceCode,
    currencyCode: header.currencyCode,
    ...dual,
    ...(!isUsd && roe && roe > 1 ? { exchangeRate: roe } : {}),
    lines: mappedLines,
    subtotalExclTax: round2(subtotalExclTax),
    concessionFeePercent:
      subtotalExclTax > 0 && concessionTotals.concessionFeeAmount > 0
        ? concessionTotals.concessionFeePercent
        : undefined,
    concessionFeeAmount,
    grossAmount,
    grossAmountInr: dualCurrencyLayout
      ? dual.grossAmountInr
      : usdReceivable
        ? undefined
        : isUsd
          ? dual.grossAmountInr
          : grossAmountInr,
    cgstPercent: cgstAmount > 0 || isUsd ? cgstPercent : undefined,
    cgstAmount,
    sgstPercent: sgstAmount > 0 || isUsd ? sgstPercent : undefined,
    sgstAmount,
    igstPercent: undefined,
    igstAmount,
    totalInclTax,
    totalReceivableUsd: dualCurrencyLayout || usdReceivable ? dual.totalReceivableUsd : undefined,
    totalReceivableInr: dualCurrencyLayout
      ? dual.totalReceivableInr
      : isUsd && !usdReceivable
        ? dual.totalReceivableInr
        : !isUsd
          ? totalInclTax
          : undefined,
    amountInWords: dualCurrencyLayout
      ? dual.amountInWordsInr ?? ''
      : usdReceivable
        ? dual.amountInWordsUsd ?? ''
        : amountWordsInr(totalInclTax),
    amountInWordsUsd: dualCurrencyLayout || usdReceivable ? dual.amountInWordsUsd : undefined,
    amountInWordsInr: dualCurrencyLayout
      ? dual.amountInWordsInr
      : isUsd && !usdReceivable
        ? dual.amountInWordsInr
        : !isUsd
          ? amountWordsInr(totalInclTax)
          : undefined,
    bankDetails,
    hasAnnexures: params.hasAnnexures ?? mappedLines.some((l) => l.amount > 0),
  };
}

/**
 * BHS / ADS lines carry the flight's own category (Dom/Int) on `sourceRef`.
 * The contract category, then the service-catalog category, cover legacy lines
 * composed before the category was persisted.
 */
function inferFlightCategory(
  lines: InvoiceLineLike[],
  catalog: ServiceCatalogLike[] | undefined,
  contractCategory: string | undefined,
): string {
  const fromLines = resolveInvoiceFlightCategory(
    lines.flatMap((line) => {
      const ref = line.sourceRef ?? {};
      const snap = ref.operationalSnapshot as Record<string, unknown> | undefined;
      const listed = Array.isArray(ref.categoriesOfFlight)
        ? ref.categoriesOfFlight.map((value) => String(value ?? ''))
        : [];
      return [...listed, pickCategoryOfFlight(ref, snap)];
    }),
  );
  if (fromLines) return fromLines;

  const fromContract = resolveInvoiceFlightCategory([contractCategory]);
  if (fromContract) return fromContract;

  const code = lines.find((l) => l.serviceCode)?.serviceCode;
  if (!code) return '';
  return resolveInvoiceFlightCategory([
    catalog?.find((s) => s.serviceCode === code)?.category,
  ]);
}

function round2(n: number): number {
  return roundBillingMoney(n);
}
