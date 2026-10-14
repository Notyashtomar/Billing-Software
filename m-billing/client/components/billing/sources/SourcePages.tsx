import type { BillingApi } from '@/lib/billing-api';
import { OperationalSourcePage, type OperationalSourceConfig } from './OperationalSourcePage';

type Props = { api: BillingApi };

export function ScheduledFlightsSourcePage({ api }: Props) {
  const config: OperationalSourceConfig = {
    title: 'BHS',
    description: '',
    fetchMethod: 'listScheduledFlights',
    bcAuditRef: 'BC_SCREEN_INVENTORY.md §B1',
    // Delhi stays August 2026. Other stations are shifted to September in OperationalSourcePage.
    defaultFrom: '2026-08-01',
    defaultTo: '2026-08-31',
  };
  return <OperationalSourcePage api={api} config={config} />;
}

export function CleaningSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'Cleaning',
        description:
          'FHR ramp cleaning times — Cabin Cleaning, plus Night Halt Cleaning when marked night-halt',
        fetchMethod: 'listCleaning',
        bcAuditRef: 'BC_SCREEN_INVENTORY.md §B9',
      }}
    />
  );
}

export function RafSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'RAF',
        description:
          'Creation → RAF flights for airlines in Advance → RAF Airline. Equipment palette chips use seeded Chennai Excel Equipment No values stored in DB (GPU-140KV, GPU-NB, PBNB, ISTNB, RC, WC, EBT, UH). Cleaning lines appear when Deep / Night Halt / Exterior flags are on. Charged from RAF adhoc tariff only (no contracts).',
        fetchMethod: 'listRaf',
        bcAuditRef: 'FRIS Ramp Assistance Forms → billing RAF',
        // Default billing window: August 2026 (MAA Aug RAF seed).
        defaultFrom: '2026-08-01',
        defaultTo: '2026-08-31',
      }}
    />
  );
}

export function MaasSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'MAAS',
        description:
          'Meet-and-greet escort billing — airline passengers escorted by Bird staff. Filter by shift, service type, glove grade, and flight, then send eligible escorts to preparation.',
        fetchMethod: 'listMaas',
        bcAuditRef: 'AVIATION_PAGES.md MAAS',
        defaultFrom: '2026-08-01',
        defaultTo: '2026-08-31',
      }}
    />
  );
}

export function AdsSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'ADS usage',
        description:
          'FHR equipment / wheelchair lines (same source as Scheduled data export). Contract ADS rules = billable; other usage is free / BHS package.',
        fetchMethod: 'listAds',
        bcAuditRef: 'BC_SCREEN_INVENTORY §B2',
        // MAA Aug 2026 equipment seed → fhr_collection.equipmentDetails
        defaultFrom: '2026-08-01',
        defaultTo: '2026-08-31',
      }}
    />
  );
}

export function XxldScheduledSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'XXLD scheduled',
        description: 'Cancelled scheduled flights — Addl & XXLD Flt rules',
        fetchMethod: 'listXxldScheduled',
        bcAuditRef: 'BC_VALIDATION_RULES.md §4',
      }}
    />
  );
}

export function XxldNonScheduledSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'XXLD non-scheduled',
        description: 'Non-scheduled cancellation billing',
        fetchMethod: 'listXxldNonScheduled',
        bcAuditRef: 'GAP_LIST.md §XXLD Non-SKD',
      }}
    />
  );
}

export function EquipmentSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'Equipment',
        description:
          'MAA: FHR equipment lines (equipment family). Other stations: ads_usage_data Equipment codes.',
        fetchMethod: 'listEquipment',
        bcAuditRef: 'BC_SCREEN_INVENTORY §B8',
        defaultFrom: '2026-08-01',
        defaultTo: '2026-08-31',
      }}
    />
  );
}

export function ManpowerSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'Manpower',
        description:
          'MAA: FHR manpower lines (CSA/UH/WW…). Other stations: ads_usage_data Manpower codes.',
        fetchMethod: 'listManpower',
        bcAuditRef: 'EXPORT_LOG_TYPE_LABELS manpower',
        defaultFrom: '2026-08-01',
        defaultTo: '2026-08-31',
      }}
    />
  );
}

export function NonScheduledSourcePage({ api }: Props) {
  return (
    <OperationalSourcePage
      api={api}
      config={{
        title: 'Non-scheduled flights',
        description: 'ns_raw_flight_data operational intake',
        fetchMethod: 'listNonScheduled',
        bcAuditRef: 'GAP_LIST.md Non-Scheduled',
      }}
    />
  );
}

/**
 * @deprecated Ops Custom source removed. `/billing/custom` redirects to
 * Preparation → Custom (standalone form, no flights). Kept for accidental imports only.
 */
export function CustomSourcePage({ api }: Props) {
  const customApi = {
    ...api,
    listScheduledFlights: (params: {
      from: string;
      to: string;
      dateBasis?: string;
      customerCode?: string;
    }) => api.listCustom(params),
    ingestPreparation: (body: {
      billingPeriodStart: string;
      billingPeriodEnd: string;
      rows: unknown[];
    }) =>
      api.ingestPreparation({
        ...body,
        rows: (body.rows ?? []).map((row) => {
          const r = row as Record<string, unknown>;
          return { ...r, sourceType: 'custom' };
        }),
      }),
  } as BillingApi;

  return (
    <OperationalSourcePage
      api={customApi}
      config={{
        title: 'Custom billing (moved)',
        description:
          'Custom billing moved to Preparation → Custom. No flights — enter lines and submit to invoice draft.',
        fetchMethod: 'listScheduledFlights',
        bcAuditRef: 'Custom billing operational source',
        defaultFrom: '2026-08-01',
        defaultTo: '2026-08-31',
      }}
    />
  );
}
