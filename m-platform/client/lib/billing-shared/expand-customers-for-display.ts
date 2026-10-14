import type { BillingCustomer } from '@/lib/billing-shared/types';

export type CustomerScheduleLine = {
  flightNumber: string;
  aircraftType?: string;
};

export type CustomerDisplayRow = BillingCustomer & {
  rowKey: string;
  displayFlightNumber: string;
  displayAircraftType: string;
};

function scheduleLinesFor(customer: BillingCustomer): CustomerScheduleLine[] {
  const fromSchedule =
    customer.scheduleLines?.filter((line) => line.flightNumber?.trim()) ?? [];
  if (fromSchedule.length > 0) return fromSchedule;
  if (!customer.flightNumber) return [];
  return customer.flightNumber
    .split(',')
    .map((flightNumber) => ({
      flightNumber: flightNumber.trim(),
      aircraftType: customer.aircraftType,
    }))
    .filter((line) => line.flightNumber);
}

function displayAircraftType(customer: BillingCustomer, lines: CustomerScheduleLine[]): string {
  const types = new Set<string>();
  for (const line of lines) {
    const type = line.aircraftType?.trim();
    if (type) types.add(type);
  }
  if (types.size === 0 && customer.aircraftType?.trim()) {
    for (const part of customer.aircraftType.split(',')) {
      const type = part.trim();
      if (type) types.add(type);
    }
  }
  return types.size > 0 ? [...types].join(', ') : '—';
}

/** One customers-table row per airline. Flight lines stay on the customer record for the edit form. */
export function expandCustomersForDisplay(
  customers: BillingCustomer[],
): CustomerDisplayRow[] {
  return customers.map((customer) => {
    const lines = scheduleLinesFor(customer);
    return {
      ...customer,
      rowKey: customer._id,
      displayFlightNumber:
        lines.map((line) => line.flightNumber).filter(Boolean).join(', ') || '—',
      displayAircraftType: displayAircraftType(customer, lines),
    };
  });
}
