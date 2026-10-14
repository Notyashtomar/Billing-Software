import {
  formatInrAmount,
  parseAdvanceAmount,
  stationDisplayLabel,
  type NonScheduledAdvanceInvoiceData,
} from './nonScheduledAdvanceInvoice';

/**
 * Advance invoice document model for Non-Scheduled bookings.
 *
 * The grid (company / bill-to block, particulars table, concession fee, CGST +
 * SGST, amount in words) follows the station tax-invoice stationery so the
 * airline receives the same document shape it already reconciles against.
 * Fields that are not known at booking time (customer GSTIN, IRN) stay blank —
 * they must never be filled with placeholder values on a financial document.
 */

export const NS_CONCESSION_FEE_PERCENT = 3;
export const NS_CGST_PERCENT = 9;
export const NS_SGST_PERCENT = 9;

export type NsInvoiceCompany = {
  name: string;
  addressLines: string[];
  gstin: string;
  cin: string;
  phone: string;
  pan: string;
};

export type NsInvoiceBank = {
  bankName: string;
  branchAddress: string;
  beneficiaryName: string;
  accountNumber: string;
  swiftCode: string;
  ifscCode?: string;
};

/** Airline / customer block on the advance invoice. */
export type NsInvoiceBillToProfile = {
  name: string;
  addressLines: string[];
  stateCode: string;
  gstin: string;
  pan: string;
};

export type NsStationInvoiceProfile = {
  company: NsInvoiceCompany;
  serviceStation: string;
  state: string;
  stateCode: string;
  placeOfSupply: string;
  /** SAC 996761 — "Airport operation services (excluding cargo handling)". */
  sacCode: string;
  serviceCode: string;
  serviceDescription: string;
  bank: NsInvoiceBank | null;
};

/** GSTIN positions 3–12 embed the 10-character PAN. */
export function panFromGstin(gstin: string | null | undefined): string {
  const value = String(gstin ?? '')
    .trim()
    .toUpperCase();
  if (value.length < 12) return '';
  return value.slice(2, 12);
}

const GSTIN_STATE_NAMES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

/** Resolve state/UT display name from GSTIN prefix (first two digits). */
export function stateNameFromGstin(gstin: string | null | undefined): string {
  const value = String(gstin ?? '')
    .trim()
    .toUpperCase();
  if (value.length < 2) return '';
  return GSTIN_STATE_NAMES[value.slice(0, 2)] ?? '';
}

const EMPTY_BANK: NsInvoiceBank = {
  bankName: '',
  branchAddress: '',
  beneficiaryName: '',
  accountNumber: '',
  swiftCode: '',
};

/**
 * Registered entity master per station. Only stations whose statutory details
 * are confirmed carry GSTIN / CIN / bank rows; the rest print the legal name
 * and leave the statutory cells blank for the finance team to complete.
 */
const STATION_INVOICE_PROFILES: Record<string, NsStationInvoiceProfile> = {
  MAA: {
    company: {
      name: 'BIRD AIRPORT SERVICES (CHENNAI) PRIVATE LIMITED',
      addressLines: [
        'DOMESTIC TERMINAL, NEW DOMESTIC TERMINAL,',
        'BUILDING(T-1), AIRPORT  CHENNAI  600016',
      ],
      gstin: '33AALCB3911H1ZX',
      cin: 'U63032TN2023PTC158390',
      phone: '30417700',
      pan: 'AALCB3911H',
    },
    serviceStation: 'CHENNAI',
    state: 'Tamil Nadu',
    stateCode: '33',
    placeOfSupply: 'Tamil Nadu',
    sacCode: '996761',
    serviceCode: 'BHS',
    serviceDescription: 'Airport Services',
    bank: {
      bankName: 'HDFC BANK',
      branchAddress: 'M-36, OUTER CIRCLE, CONNAUGHT PLACE, NEW DELHI – 110001, DELHI',
      beneficiaryName: 'Bird Airport SVC Chennai PL CLN Escrow AC',
      accountNumber: '99900000600016',
      swiftCode: 'HDFCINBB',
    },
  },
};

export function resolveStationInvoiceProfile(
  stationCode: string,
): NsStationInvoiceProfile {
  const code = String(stationCode ?? '').trim().toUpperCase();
  const known = STATION_INVOICE_PROFILES[code];
  if (known) return known;

  const label = stationDisplayLabel(code);
  return {
    company: {
      name: `BIRD AIRPORT SERVICES (${label}) PRIVATE LIMITED`,
      addressLines: [`${label} AIRPORT`],
      gstin: '',
      cin: '',
      phone: '',
      pan: '',
    },
    serviceStation: label,
    state: '',
    stateCode: '',
    placeOfSupply: '',
    sacCode: '996761',
    serviceCode: 'BHS',
    serviceDescription: 'Airport Services',
    bank: null,
  };
}

export function nsInvoiceBankRows(profile: NsStationInvoiceProfile): Array<[string, string]> {
  const bank = profile.bank ?? EMPTY_BANK;
  return [
    ['Bank Name :', bank.bankName],
    ['Branch :', bank.branchAddress],
    ['Beneficiary Name :', bank.beneficiaryName],
    ['Beneficiary A/C No. :', bank.accountNumber],
    ["Swift Code of Beneficiary's Bank :", bank.swiftCode],
  ];
}

export const NS_INVOICE_TERMS: string[] = [
  'Rates are excluding concession fee payable to The Airport Operator.',
  'This advance is raised against the confirmed Non-Scheduled flight booking and is adjusted against the final tax invoice for the same flight.',
  'Handling is confirmed only after the advance is realised in the account mentioned hereinbelow.',
  '18% annual interest will be levied, if the payment is delayed beyond 7 days.',
  'All claims and disputes must be communicated in writing within three days from the date of receipt of the invoice.',
];

export const NS_INVOICE_FOOTER_NOTE =
  '"This is a computer generated Advance Invoice issued from FRIS, hence no signature required."';

const MONTHS = [
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
];

/** `dd/MM/yyyy` (or ISO) → `03 July 2026`; returns input when unparseable. */
export function toLongInvoiceDate(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  const day = dmy ? Number(dmy[1]) : iso ? Number(iso[3]) : NaN;
  const month = dmy ? Number(dmy[2]) : iso ? Number(iso[2]) : NaN;
  const year = dmy ? Number(dmy[3]) : iso ? Number(iso[1]) : NaN;
  if (!day || !month || !year || month < 1 || month > 12) return value;
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type NsInvoiceTotals = {
  /** Line amount excluding concession fee and tax. */
  subtotal: number;
  concessionPercent: number;
  concessionFee: number;
  gross: number;
  cgstPercent: number;
  cgst: number;
  sgstPercent: number;
  sgst: number;
  taxTotal: number;
  total: number;
  roundedTotal: number;
  amountInWords: string;
};

export function calculateNsInvoiceTotals(rawAmount: string | number): NsInvoiceTotals {
  const parsed = parseAdvanceAmount(rawAmount);
  const subtotal = round2(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
  const concessionFee = round2(subtotal * (NS_CONCESSION_FEE_PERCENT / 100));
  const gross = round2(subtotal + concessionFee);
  const cgst = round2(gross * (NS_CGST_PERCENT / 100));
  const sgst = round2(gross * (NS_SGST_PERCENT / 100));
  const taxTotal = round2(cgst + sgst);
  const total = round2(gross + taxTotal);
  const roundedTotal = Math.round(total);
  return {
    subtotal,
    concessionPercent: NS_CONCESSION_FEE_PERCENT,
    concessionFee,
    gross,
    cgstPercent: NS_CGST_PERCENT,
    cgst,
    sgstPercent: NS_SGST_PERCENT,
    sgst,
    taxTotal,
    total,
    roundedTotal,
    amountInWords: amountInWordsInr(roundedTotal),
  };
}

const BELOW_TWENTY = [
  '',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
];

const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function twoDigitWords(n: number): string {
  if (n < 20) return BELOW_TWENTY[n] ?? '';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens] ?? ''}${ones ? ` ${BELOW_TWENTY[ones]}` : ''}`.trim();
}

function threeDigitWords(n: number): string {
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${BELOW_TWENTY[hundreds]} HUNDRED` : '', rest ? twoDigitWords(rest) : '']
    .filter(Boolean)
    .join(' ');
}

function indianNumberWords(n: number): string {
  if (n === 0) return 'ZERO';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const hundred = n % 1000;
  if (crore) parts.push(`${threeDigitWords(crore)} CRORE`);
  if (lakh) parts.push(`${threeDigitWords(lakh)} LAKH`);
  if (thousand) parts.push(`${threeDigitWords(thousand)} THOUSAND`);
  if (hundred) parts.push(threeDigitWords(hundred));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Mirrors the billing engine wording so both documents read identically. */
export function amountInWordsInr(amount: number): string {
  const rupees = Math.floor(Math.round(amount * 100) / 100);
  const paise = Math.round(amount * 100) % 100;
  return `${indianNumberWords(rupees)} RUPEES AND ${
    paise === 0 ? 'ZERO' : twoDigitWords(paise)
  } PAISA ONLY`;
}

export function formatInrRounded(n: number): string {
  return Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export type NsInvoiceLine = {
  srNo: string;
  particular: string;
  used: string;
  charged: string;
  aircraftType: string;
  unit: string;
  rate: string;
  amount: string;
};

export type NsInvoiceModel = {
  title: string;
  irn: string;
  company: NsInvoiceCompany;
  billTo: {
    name: string;
    addressLines: string[];
    stateCode: string;
    gstin: string;
    pan: string;
  };
  /** Right-hand header column, top block (Invoice No → CIN). */
  metaRows: Array<[string, string]>;
  /** Right-hand header column, service block (Description → Place of Supply). */
  serviceRows: Array<[string, string]>;
  /** Booking / flight strip printed under the header grid. */
  flightRows: Array<[string, string]>;
  lines: NsInvoiceLine[];
  totals: NsInvoiceTotals;
  totalRows: Array<{ label: string; value: string; bold: boolean; prefix?: string }>;
  terms: string[];
  bankRows: Array<[string, string]>;
  footerNote: string;
  profile: NsStationInvoiceProfile;
};

function dash(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function dateTimeLabel(date?: string, time?: string): string {
  return [dash(date), dash(time)].filter(Boolean).join(' ');
}

function periodLabel(data: NonScheduledAdvanceInvoiceData): string {
  const from = toLongInvoiceDate(data.staDate);
  const to = toLongInvoiceDate(data.stdDate);
  if (from && to && from !== to) return `${from} – ${to}`;
  return from || to || toLongInvoiceDate(data.invoiceDate);
}

function billToAddressLines(data: NonScheduledAdvanceInvoiceData): string[] {
  return [
    data.airlineCode ? `Airline Code: ${data.airlineCode}` : '',
    data.companyName && data.companyName !== data.airlineBillTo ? data.companyName : '',
    data.operator && data.operator !== data.airlineBillTo ? `Operator: ${data.operator}` : '',
  ].filter(Boolean);
}

function lineParticular(data: NonScheduledAdvanceInvoiceData): string {
  const flight = dash(data.flightNo);
  const ops = dash(data.opsType);
  const suffix = [flight ? `Flight ${flight}` : '', ops].filter(Boolean).join(' · ');
  const base = 'Advance towards Non-Scheduled Flight Handling (Comprehensive)';
  return suffix ? `${base} — ${suffix}` : base;
}

export function buildNsInvoiceModel(data: NonScheduledAdvanceInvoiceData): NsInvoiceModel {
  const profile = resolveStationInvoiceProfile(data.stationCode);
  const totals = calculateNsInvoiceTotals(data.amount);

  const metaRows: Array<[string, string]> = [
    ['Invoice No.', dash(data.invoiceNo)],
    ['Invoice Date', toLongInvoiceDate(data.invoiceDate)],
    ['GSTIN', profile.company.gstin],
    ['CIN', profile.company.cin],
  ];

  const serviceRows: Array<[string, string]> = [
    ['Description of Services', profile.serviceDescription],
    ['Flight Category', dash(data.categoryOfFlight)],
    ['For the Period', periodLabel(data)],
    ['Service Station', profile.serviceStation],
    ['State', profile.state],
    ['SAC', profile.sacCode],
    ['Service Code', profile.serviceCode],
    ['Place of Supply', profile.placeOfSupply],
  ];

  const flightRows: Array<[string, string]> = [
    ['Booking No.', dash(data.bookingNo)],
    ['Proforma No.', dash(data.challanNo)],
    ['Booking Date', dash(data.bookingDate)],
    ['Flight No.', dash(data.flightNo)],
    ['Registration No.', dash(data.registrationNo)],
    ['Routing', dash(data.routing)],
    ['Aircraft Type', dash(data.aircraftType)],
    ['MTOW', dash(data.mtow)],
    ['Terminal', dash(data.terminalCode)],
    ['Type of Ops', dash(data.opsType)],
    ['STA', dateTimeLabel(data.staDate, data.staTime)],
    ['STD', dateTimeLabel(data.stdDate, data.stdTime)],
  ].filter(([, value]) => value !== '') as Array<[string, string]>;

  const lines: NsInvoiceLine[] = [
    {
      srNo: '1',
      particular: lineParticular(data),
      used: '',
      charged: '1',
      aircraftType: dash(data.aircraftType),
      unit: 'Per Flight',
      rate: formatInrAmount(totals.subtotal),
      amount: formatInrAmount(totals.subtotal),
    },
  ];

  const totalRows: Array<{ label: string; value: string; bold: boolean; prefix?: string }> = [
    { label: 'Total Amount in INR', value: formatInrAmount(totals.subtotal), bold: true },
  ];
  if (totals.concessionFee > 0) {
    totalRows.push({
      label: `Concession Fee @ ${totals.concessionPercent.toFixed(2)}%`,
      value: formatInrAmount(totals.concessionFee),
      bold: false,
    });
  }
  totalRows.push({
    label: 'Total Gross Revenue in INR',
    value: formatInrAmount(totals.gross),
    bold: true,
  });
  totalRows.push({
    label: `CGST @ ${totals.cgstPercent.toFixed(2)}%`,
    value: formatInrAmount(totals.cgst),
    bold: false,
    prefix: 'Add:',
  });
  totalRows.push({
    label: `SGST @ ${totals.sgstPercent.toFixed(2)}%`,
    value: formatInrAmount(totals.sgst),
    bold: false,
  });

  return {
    title: 'ADVANCE INVOICE',
    irn: '',
    company: profile.company,
    billTo: {
      name: dash(data.airlineBillTo),
      addressLines: billToAddressLines(data),
      stateCode: '',
      gstin: '',
      pan: '',
    },
    metaRows,
    serviceRows,
    flightRows,
    lines,
    totals,
    totalRows,
    terms: NS_INVOICE_TERMS,
    bankRows: profile.bank ? nsInvoiceBankRows(profile) : [],
    footerNote: NS_INVOICE_FOOTER_NOTE,
    profile,
  };
}
