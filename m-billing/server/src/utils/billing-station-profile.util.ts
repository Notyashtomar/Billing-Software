/**
 * Billing station profile defaults from the Bird station legal / GST registry
 * (`STATION_LEGAL_DETAILS` in m-admin). Used to auto-fill `/billing/settings`
 * and as the registry fallback for invoice letterhead when settings are empty.
 */

import { findStationLegalDetails } from 'src/admin-stations/utils/station-legal-details.util';
import type { BillingSettings } from '../schemas/billing.schemas';

export type BillingStationProfileDefaults = {
  gstStateCode: string;
  companyLegalEntity: {
    name: string;
    address: string;
    gstin: string;
    pan: string;
  };
};

export function panFromGstin(gstin?: string): string {
  if (!gstin || gstin.length < 12) return '';
  return gstin.slice(2, 12);
}

export function formatStationLegalAddress(details: {
  street: string;
  addressCity: string;
  pincode: string;
}): string {
  const street = details.street.trim();
  const city = details.addressCity.trim();
  const pincode = details.pincode.trim();
  const parts = [street];
  if (city && !street.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  const address = parts.filter(Boolean).join(', ');
  if (!pincode || address.includes(pincode)) return address;
  return `${address} - ${pincode}`;
}

/** Registry row for one IATA station code, or null when unknown. */
export function resolveBillingStationProfileDefaults(
  stationCode: string,
): BillingStationProfileDefaults | null {
  const details = findStationLegalDetails({
    stationCode: stationCode.trim().toUpperCase(),
  });
  if (!details) return null;

  const gstin = details.gstNumber.trim().toUpperCase();
  if (!gstin) return null;

  return {
    gstStateCode: gstin.slice(0, 2),
    companyLegalEntity: {
      name: details.company.trim(),
      address: formatStationLegalAddress(details),
      gstin,
      pan: panFromGstin(gstin),
    },
  };
}

function isBlank(value: unknown): boolean {
  return !String(value ?? '').trim();
}

/**
 * Fill only empty billing settings fields from the registry.
 * Saved station profile values are never overwritten.
 */
export function mergeBillingSettingsWithRegistry(
  doc: BillingSettings,
  stationCode: string,
): { merged: BillingSettings; changed: boolean } {
  const defaults = resolveBillingStationProfileDefaults(stationCode);
  if (!defaults) return { merged: doc, changed: false };

  let changed = false;
  const merged: BillingSettings = { ...doc };

  if (isBlank(merged.gstStateCode) && defaults.gstStateCode) {
    merged.gstStateCode = defaults.gstStateCode;
    changed = true;
  }

  const entity: NonNullable<BillingSettings['companyLegalEntity']> = {
    name: merged.companyLegalEntity?.name ?? '',
    ...(merged.companyLegalEntity ?? {}),
  };
  for (const key of ['name', 'address', 'gstin', 'pan'] as const) {
    if (isBlank(entity[key]) && defaults.companyLegalEntity[key]) {
      entity[key] = defaults.companyLegalEntity[key];
      changed = true;
    }
  }
  if (changed || merged.companyLegalEntity == null) {
    merged.companyLegalEntity = entity;
  }

  return { merged, changed };
}
