import { fetchAdminStations } from '@/lib/admin-stations-api';
import { billingApi } from '@/lib/billing-api';
import type { StationRecord } from '@/lib/stationAnalyticsMock';
import {
  panFromGstin,
  resolveStationInvoiceProfile,
  stateNameFromGstin,
  type NsInvoiceBank,
  type NsInvoiceBillToProfile,
  type NsStationInvoiceProfile,
} from './nonScheduledInvoiceModel';

type BillingSettingsDoc = {
  stationCode?: string;
  gstStateCode?: string;
  companyLegalEntity?: {
    name?: string;
    address?: string;
    gstin?: string;
    pan?: string;
    cin?: string;
    phone?: string;
  };
  bankDetails?: Partial<NsInvoiceBank> & { ifscCode?: string };
};

type BillingCustomerDoc = {
  customerCode?: string;
  name?: string;
  address?: string;
  globalDimension2?: string;
  gstRegistrationNo?: string;
};

export type NsFetchedInvoiceDetails = {
  stationProfile: NsStationInvoiceProfile;
  billTo: NsInvoiceBillToProfile | null;
  source: 'station-and-billing-masters' | 'station-master' | 'fallback';
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function splitAddress(value: unknown): string[] {
  const address = text(value);
  if (!address) return [];
  return address
    .split(/\r?\n|,\s*(?=[A-Za-z0-9])/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stationMatches(row: StationRecord, stationCode: string): boolean {
  const wanted = stationCode.trim().toUpperCase();
  return (
    text(row.stationCode).toUpperCase() === wanted ||
    text(row.code).toUpperCase() === wanted ||
    text(row.code).toUpperCase().startsWith(`${wanted}-`)
  );
}

function stationAddress(row: StationRecord | undefined): string[] {
  if (!row) return [];
  return [
    text(row.street),
    [text(row.addressCity || row.city), text(row.state), text(row.pincode)]
      .filter(Boolean)
      .join(' '),
    text(row.country),
  ].filter(Boolean);
}

function mergeStationProfile(
  stationCode: string,
  station: StationRecord | undefined,
  settings: BillingSettingsDoc | null,
): NsStationInvoiceProfile {
  const fallback = resolveStationInvoiceProfile(stationCode);
  const entity = settings?.companyLegalEntity;
  const gstin = text(entity?.gstin || station?.gstNumber || fallback.company.gstin).toUpperCase();
  const addressLines =
    splitAddress(entity?.address).length > 0
      ? splitAddress(entity?.address)
      : stationAddress(station).length > 0
        ? stationAddress(station)
        : fallback.company.addressLines;
  const stateCode = text(
    settings?.gstStateCode || gstin.slice(0, 2) || fallback.stateCode,
  );
  const state = text(
    station?.state || stateNameFromGstin(gstin) || fallback.state,
  );
  const configuredBank = settings?.bankDetails;
  const hasConfiguredBank = Boolean(
    configuredBank &&
      (text(configuredBank.bankName) ||
        text(configuredBank.accountNumber) ||
        text(configuredBank.beneficiaryName)),
  );
  const bank = hasConfiguredBank
    ? {
        bankName: text(configuredBank?.bankName),
        branchAddress: text(configuredBank?.branchAddress),
        beneficiaryName: text(configuredBank?.beneficiaryName),
        accountNumber: text(configuredBank?.accountNumber),
        ifscCode: text(configuredBank?.ifscCode),
        swiftCode: text(configuredBank?.swiftCode),
      }
    : fallback.bank;

  return {
    ...fallback,
    company: {
      name: text(entity?.name || station?.company || fallback.company.name),
      addressLines,
      gstin,
      pan: text(entity?.pan || panFromGstin(gstin) || fallback.company.pan).toUpperCase(),
      cin: text(entity?.cin || fallback.company.cin).toUpperCase(),
      phone: text(entity?.phone || fallback.company.phone),
    },
    serviceStation: text(station?.city || fallback.serviceStation).toUpperCase(),
    state,
    stateCode,
    placeOfSupply: state || stateNameFromGstin(gstin) || fallback.placeOfSupply,
    bank,
  };
}

function selectCustomer(
  rows: BillingCustomerDoc[],
  airlineCode: string,
  airlineName: string,
): BillingCustomerDoc | undefined {
  const wantedCode = airlineCode.trim().toUpperCase();
  const wantedName = airlineName.trim().toLowerCase();
  return (
    rows.find((row) => text(row.customerCode).toUpperCase() === wantedCode) ??
    rows.find((row) => text(row.name).toLowerCase() === wantedName) ??
    rows.find((row) => text(row.name).toLowerCase().includes(wantedName))
  );
}

/**
 * Fetches seller station and airline billing identities from their canonical
 * station-scoped masters. Failed billing permission never blocks printing:
 * admin station details still supply legal company, address, state and GSTIN.
 */
export async function fetchNsInvoiceDetails(input: {
  stationCode: string;
  airlineCode: string;
  airlineName: string;
}): Promise<NsFetchedInvoiceDetails> {
  const [stationsResult, settingsResult, customersResult] = await Promise.allSettled([
    fetchAdminStations(input.stationCode),
    billingApi.getSettings(),
    billingApi.listCustomers({
      search: input.airlineCode || input.airlineName,
      limit: 20,
      active: 'true',
    }),
  ]);

  const stations = stationsResult.status === 'fulfilled' ? stationsResult.value : [];
  const station = stations.find((row) => stationMatches(row, input.stationCode));
  const settings =
    settingsResult.status === 'fulfilled'
      ? ((settingsResult.value as { data?: BillingSettingsDoc }).data ?? null)
      : null;
  const settingsForStation =
    settings && text(settings.stationCode).toUpperCase() === input.stationCode.trim().toUpperCase()
      ? settings
      : null;
  const customerRows =
    customersResult.status === 'fulfilled'
      ? (((customersResult.value as { data?: unknown[] }).data ?? []) as BillingCustomerDoc[])
      : [];
  const customer = selectCustomer(customerRows, input.airlineCode, input.airlineName);
  const customerGstin = text(customer?.gstRegistrationNo).toUpperCase();
  const customerAddress = splitAddress(customer?.address || customer?.globalDimension2);

  return {
    stationProfile: mergeStationProfile(input.stationCode, station, settingsForStation),
    billTo: customer
      ? {
          name: text(customer.name || input.airlineName),
          addressLines: customerAddress,
          stateCode: customerGstin.slice(0, 2),
          gstin: customerGstin,
          pan: panFromGstin(customerGstin),
        }
      : null,
    source: settingsForStation
      ? 'station-and-billing-masters'
      : station
        ? 'station-master'
        : 'fallback',
  };
}
