import { findStationLegalDetails } from 'src/admin-stations/utils/station-legal-details.util';
import {
  panFromGstin as panFromGstinUtil,
  resolveBillingStationProfileDefaults,
} from '../utils/billing-station-profile.util';
import type { InvoicePdfBankDetails, InvoicePdfContactRow } from './invoice-pdf.types';

/**
 * Chennai tax invoice — static vs dynamic field map
 * (aligned with Chennai_Airport_Invoice_Static_vs_Dynamic_Fields.txt)
 *
 * STATIC (master / defaults — always print on every invoice):
 *   Company profile, airport configuration, bank details, terms, contacts, footer
 *
 * CUSTOMER MASTER (static when present in DB — blank when missing):
 *   Bill-to name, address, GSTIN, PAN, state code
 *
 * DYNAMIC (transaction — blank until available):
 *   Invoice no., date, IRN, QR, billing period, flight category, line items, totals
 *
 * Station scope: the legal entity, address, GSTIN, state and place of supply belong
 * to the invoicing station. A station never inherits another station's registration —
 * unconfigured fields print blank so Airport Setup (`/billing/settings`) is filled
 * in rather than a wrong GSTIN being issued on a tax document.
 */

export type InvoicePdfCompanyDefaults = {
  name: string;
  address: string;
  gstin: string;
  cin: string;
  phone: string;
  pan: string;
  msme: string;
};

export type InvoicePdfAirportConfig = {
  airportName: string;
  airportCode: string;
  serviceStation: string;
  state: string;
  placeOfSupply: string;
  sacCode: string;
  serviceCode: string;
  serviceDescription: string;
};

export const CHENNAI_AIRPORT_CONFIG: InvoicePdfAirportConfig = {
  airportName: 'Chennai International Airport',
  airportCode: 'MAA',
  serviceStation: 'CHENNAI',
  state: 'Tamil Nadu',
  placeOfSupply: 'Tamil Nadu',
  sacCode: '996761',
  serviceCode: 'BHS',
  serviceDescription: 'Airport Services',
};

export const CHENNAI_INVOICE_CONTACTS: InvoicePdfContactRow[] = [
  {
    location: 'Corporate Office',
    name: 'Mr. Rakesh Jain',
    position: 'Manager - Invoicing & MIS',
    phone: '+91 9871155629',
    email: 'rkj@bird.in; receivable@bird.in',
  },
  {
    location: 'Corporate Office',
    name: 'Mr. Amit Sharma',
    position: 'Manager - Receivable & Accounting',
    phone: '+91 9990817550',
    email: 'amit.sharma@thebirdgroup.com; receivable@bird.in',
  },
  {
    location: 'Station Office',
    name: 'Mr. Anand Nagraj',
    position: '',
    phone: '+91 78385 98181',
    email: 'ana@bird.in',
  },
];

export const CHENNAI_INVOICE_FOOTER = {
  savePaperMessage: '"Save Paper , Save Trees , Go Digital!!!"',
  eInvoiceDisclaimer:
    '"This is computer generated Tax Invoice with IRN and QR Code issued from GST e-invoice portal, hence no digital signature required"',
  authorisedSignatoryLabel: 'Autorised signatory',
} as const;

/** Structural defaults always printed on every tax invoice (Chennai / MAA reference). */
export const CHENNAI_INVOICE_DEFAULTS = {
  serviceDescription: CHENNAI_AIRPORT_CONFIG.serviceDescription,
  sacCode: CHENNAI_AIRPORT_CONFIG.sacCode,
  serviceCode: CHENNAI_AIRPORT_CONFIG.serviceCode,
  concessionFeePercentInr: 3,
  concessionFeePercentUsd: 15,
  company: {
    name: 'BIRD AIRPORT SERVICES (CHENNAI) PRIVATE LIMITED',
    address:
      'DOMESTIC TERMINAL, NEW DOMESTIC TERMINAL, BUILDING(T-1), AIRPORT CHENNAI 600016',
    gstin: '33AALCB3911H1ZX',
    cin: 'U63032TN2023PTC158390',
    phone: '30417700',
    pan: 'AALCB3911H',
    msme: '',
  } satisfies InvoicePdfCompanyDefaults,
  bank: {
    bankName: 'HDFC BANK',
    branchAddress: 'M-36, OUTER CIRCLE, CONNAUGHGT PLACE, NEW DELHI – 110001, DELHI',
    beneficiaryName: 'Bird Airport SVC Chennai PL CLN Escrow AC',
    accountNumber: '99900000600016',
    swiftCode: 'HDFCINBB',
  } satisfies InvoicePdfBankDetails,
  airport: CHENNAI_AIRPORT_CONFIG,
  contacts: CHENNAI_INVOICE_CONTACTS,
  footer: CHENNAI_INVOICE_FOOTER,
} as const;

const STATION_LABELS: Record<string, string> = {
  MAA: 'CHENNAI',
  HYD: 'HYDERABAD',
  BLR: 'BENGALURU',
  DEL: 'DELHI',
  BOM: 'MUMBAI',
  CCU: 'KOLKATA',
  IXC: 'CHANDIGARH',
};

const STATION_AIRPORT_CODES: Record<string, string> = {
  MAA: 'MAA',
  HYD: 'HYD',
  BLR: 'BLR',
  DEL: 'DEL',
  BOM: 'BOM',
  CCU: 'CCU',
  IXC: 'IXC',
};

/** First two GSTIN digits → state printed as State / Place of Supply. */
const GST_STATE_NAMES: Record<string, string> = {
  '03': 'Punjab',
  '04': 'Chandigarh',
  '06': 'Haryana',
  '07': 'Delhi',
  '09': 'Uttar Pradesh',
  '14': 'Manipur',
  '16': 'Tripura',
  '19': 'West Bengal',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
};

export function stationDisplayLabel(stationCode: string): string {
  const key = stationCode.trim().toUpperCase();
  const label = STATION_LABELS[key];
  if (label) return label;
  const legal = findStationLegalDetails({ stationCode: key });
  return legal?.cityAliases[0]?.toUpperCase() ?? key;
}

type StationLegalProfile = {
  name: string;
  address: string;
  gstin: string;
  cin: string;
  state: string;
};

/** Station's own registered entity from the Bird station legal / GST registry. */
function resolveStationLegalProfile(stationCode: string): StationLegalProfile | null {
  const defaults = resolveBillingStationProfileDefaults(stationCode);
  if (!defaults) return null;
  return {
    name: defaults.companyLegalEntity.name.toUpperCase(),
    address: defaults.companyLegalEntity.address.toUpperCase(),
    gstin: defaults.companyLegalEntity.gstin,
    cin: defaults.companyLegalEntity.cin,
    state: GST_STATE_NAMES[defaults.gstStateCode] ?? '',
  };
}

export function panFromGstin(gstin?: string): string | undefined {
  const pan = panFromGstinUtil(gstin);
  return pan || undefined;
}

type SettingsEntity = {
  name?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  cin?: string;
  msme?: string;
  phone?: string;
};

type SettingsBank = InvoicePdfBankDetails;

/**
 * §1 Company information — station settings override the station's registry entry.
 * Never falls back to another station's entity, GSTIN, CIN or phone.
 */
export function resolveInvoiceCompanyDefaults(
  stationCode: string,
  entity?: SettingsEntity | null,
): InvoicePdfCompanyDefaults {
  const key = stationCode.trim().toUpperCase();
  const stationLabel = stationDisplayLabel(key);
  const base: Partial<InvoicePdfCompanyDefaults> =
    key === 'MAA'
      ? CHENNAI_INVOICE_DEFAULTS.company
      : (resolveStationLegalProfile(key) ?? {});
  const gstin = entity?.gstin?.trim() || base.gstin || '';
  return {
    name:
      entity?.name?.trim() ||
      base.name ||
      `BIRD AIRPORT SERVICES (${stationLabel}) PRIVATE LIMITED`,
    address: entity?.address?.trim() || base.address || '',
    gstin,
    cin: entity?.cin?.trim() || base.cin || '',
    phone: entity?.phone?.trim() || base.phone || '',
    pan: entity?.pan?.trim() || panFromGstin(gstin) || base.pan || '',
    msme: entity?.msme?.trim() || '',
  };
}

/**
 * §2 Airport configuration — station-specific service station, state and place of
 * supply. SAC / service code / description are group-wide ground-handling values.
 */
export function resolveAirportConfig(stationCode: string): InvoicePdfAirportConfig {
  const key = stationCode.trim().toUpperCase();
  if (key === 'MAA') {
    return { ...CHENNAI_AIRPORT_CONFIG };
  }
  const serviceStation = stationDisplayLabel(key);
  const state = resolveStationLegalProfile(key)?.state ?? '';
  return {
    airportName: `${serviceStation} Airport`,
    airportCode: STATION_AIRPORT_CODES[key] ?? key,
    serviceStation,
    state,
    placeOfSupply: state,
    sacCode: CHENNAI_AIRPORT_CONFIG.sacCode,
    serviceCode: CHENNAI_AIRPORT_CONFIG.serviceCode,
    serviceDescription: CHENNAI_AIRPORT_CONFIG.serviceDescription,
  };
}

/** §3 Air India Express (Chennai / MAA) — static bill-to block on every invoice. */
export const MAA_AIR_INDIA_EXPRESS_BILL_TO = {
  name: 'AIR INDIA EXPRESS LIMITED',
  addressLines: [
    'GRN FLOOR, ROOM NO 22, AIR INDIA EXPRESS LIMITED,',
    'UNKNOWN, CHENNAI INTERNATIONAL AIRPORT, CHENNAI,',
    'KANCHEEPURAM, TAMIL NADU,',
    'CHENNAI-600027',
    'India',
  ],
} as const;

export function resolveCustomerBillToDefaults(
  stationCode: string,
  customerCode?: string,
  customerName?: string,
): { name: string; addressLines: string[] } | null {
  if (stationCode.trim().toUpperCase() !== 'MAA') return null;

  const code = customerCode?.trim().toUpperCase();
  const nameKey = customerName?.trim().toLowerCase() ?? '';
  const isAirIndiaExpress =
    code === 'IX' ||
    code === 'AIX' ||
    nameKey.includes('air india express');

  if (!isAirIndiaExpress) return null;

  return {
    name: MAA_AIR_INDIA_EXPRESS_BILL_TO.name,
    addressLines: [...MAA_AIR_INDIA_EXPRESS_BILL_TO.addressLines],
  };
}

/**
 * §10 Bank details — station settings only; the Chennai escrow account must never
 * print on another station's invoice (customers would remit to the wrong entity).
 */
export function resolveInvoiceBankDefaults(
  stationCode: string,
  bank?: SettingsBank | null,
): InvoicePdfBankDetails {
  const base: InvoicePdfBankDetails =
    stationCode.trim().toUpperCase() === 'MAA' ? CHENNAI_INVOICE_DEFAULTS.bank : {};
  return {
    bankName: bank?.bankName?.trim() || base.bankName || '',
    branchAddress: bank?.branchAddress?.trim() || base.branchAddress || '',
    beneficiaryName: bank?.beneficiaryName?.trim() || base.beneficiaryName || '',
    accountNumber: bank?.accountNumber?.trim() || base.accountNumber || '',
    swiftCode: bank?.swiftCode?.trim() || base.swiftCode || '',
    ...(bank?.ifscCode?.trim() ? { ifscCode: bank.ifscCode.trim() } : {}),
    ...(bank?.micr?.trim() ? { micr: bank.micr.trim() } : {}),
  };
}

/**
 * §12 Contact details — corporate office rows are group-wide. The station office row
 * is Chennai's, so it only prints on Chennai invoices.
 */
export function resolveInvoiceContacts(serviceStation?: string): InvoicePdfContactRow[] {
  const isChennai = String(serviceStation ?? '').trim().toUpperCase() === 'CHENNAI';
  return CHENNAI_INVOICE_CONTACTS.filter(
    (row) => isChennai || row.location.trim().toLowerCase() !== 'station office',
  ).map((row) => ({ ...row }));
}
