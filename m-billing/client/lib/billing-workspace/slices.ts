/** Durable UI slices for Phase 2+ (in-memory, user+station scoped). */

export type SourceDateBasis = 'schedule-date' | 'atd-date' | 'exported-date';
export type SourceDomIntFilter = '' | 'domestic' | 'international';

export type SourceColumnFilters = {
  category: string;
  typeOfHandling: string;
  paxFreight: string;
  ops: string;
  aircraftType: string;
  aircraftBody: string;
  customer: string;
  eligible: string;
  serial: string;
  flight: string;
  prep: string;
  engagement: string;
  bhsIncluded: string;
  charged: string;
  contract: string;
  rate: string;
  validation: string;
  particular: string;
  equipmentCode: string;
  qty: string;
  unitPrice: string;
};

export const EMPTY_SOURCE_COLUMN_FILTERS: SourceColumnFilters = {
  category: '',
  typeOfHandling: '',
  paxFreight: '',
  ops: '',
  aircraftType: '',
  aircraftBody: '',
  customer: '',
  eligible: '',
  serial: '',
  flight: '',
  prep: '',
  engagement: '',
  bhsIncluded: '',
  charged: '',
  contract: '',
  rate: '',
  validation: '',
  particular: '',
  equipmentCode: '',
  qty: '',
  unitPrice: '',
};

export type SourcePageWorkspaceSlice = {
  draftFrom: string;
  draftTo: string;
  draftDateBasis: SourceDateBasis;
  queryFrom: string;
  queryTo: string;
  queryDateBasis: SourceDateBasis;
  customerCode: string;
  queryCustomerCode: string;
  flightNo: string;
  domIntFilter: SourceDomIntFilter;
  /** Row keys currently checked. */
  selectedIds: string[];
  statFilterKeys: string[];
  adsBriefFilterKeys: string[];
  adsErrorsOnly: boolean;
  columnFilters: SourceColumnFilters;
  /** True after Search (or auto-load sources). Drives remount reload. */
  searchSubmitted: boolean;
};

export type PreparationWorkspaceSlice = {
  from: string;
  to: string;
  customerCode: string;
  /** Flight-group keys (not line ids). */
  selectedIds: string[];
  expandedIds: string[];
  selectAllMatching: boolean;
  /**
   * When period/tab/customer changes, selection is cleared.
   * Remount with the same key restores prior selection.
   */
  selectionQueryKey: string;
};

export function createSourcePageWorkspaceSlice(input: {
  from: string;
  to: string;
  dateBasis?: SourceDateBasis;
  searchSubmitted: boolean;
}): SourcePageWorkspaceSlice {
  const dateBasis = input.dateBasis ?? 'atd-date';
  return {
    draftFrom: input.from,
    draftTo: input.to,
    draftDateBasis: dateBasis,
    queryFrom: input.from,
    queryTo: input.to,
    queryDateBasis: dateBasis,
    customerCode: '',
    queryCustomerCode: '',
    flightNo: '',
    domIntFilter: '',
    selectedIds: [],
    statFilterKeys: [],
    adsBriefFilterKeys: [],
    adsErrorsOnly: false,
    columnFilters: { ...EMPTY_SOURCE_COLUMN_FILTERS },
    searchSubmitted: input.searchSubmitted,
  };
}

export function createPreparationWorkspaceSlice(
  from = '',
  to = '',
): PreparationWorkspaceSlice {
  return {
    from,
    to,
    customerCode: '',
    selectedIds: [],
    expandedIds: [],
    selectAllMatching: false,
    selectionQueryKey: '',
  };
}

/** Invoice drafts drill-down: categories → months → airlines → invoices. */
export type InvoiceDraftsNavLevel =
  | 'categories'
  | 'months'
  | 'airlines'
  | 'invoices';

export type InvoiceDraftsWorkspaceSlice = {
  navLevel: InvoiceDraftsNavLevel;
  selectedCategory: string | null;
  selectedMonthKey: string | null;
  selectedAirlineKey: string | null;
  selectedIds: string[];
};

export type InvoiceReviewWorkspaceSlice = {
  showApproved: boolean;
};

export type InvoiceListWorkspaceSlice = {
  status: string;
  selectedIds: string[];
};

export type InvoiceBinWorkspaceSlice = {
  selectedIds: string[];
};

export type InvoiceDetailWorkspaceSlice = {
  /** UI tab: general | lines | edit | … — URL `?edit=custom` still wins when present. */
  tab: string;
};

export function createInvoiceDraftsWorkspaceSlice(): InvoiceDraftsWorkspaceSlice {
  return {
    navLevel: 'categories',
    selectedCategory: null,
    selectedMonthKey: null,
    selectedAirlineKey: null,
    selectedIds: [],
  };
}

export function createInvoiceReviewWorkspaceSlice(): InvoiceReviewWorkspaceSlice {
  return { showApproved: false };
}

export function createInvoiceListWorkspaceSlice(): InvoiceListWorkspaceSlice {
  return { status: '', selectedIds: [] };
}

export function createInvoiceBinWorkspaceSlice(): InvoiceBinWorkspaceSlice {
  return { selectedIds: [] };
}

export function createInvoiceDetailWorkspaceSlice(
  tab = 'general',
): InvoiceDetailWorkspaceSlice {
  return { tab };
}

/** Billing reports date window — list rows always re-fetched from API. */
export type ReportsWorkspaceSlice = {
  from: string;
  to: string;
};

/**
 * Reserved for future audit filters (entity/action/user).
 * Empty today so the page keeps fetch-on-mount behavior unchanged.
 */
export type AuditWorkspaceSlice = {
  /** Optional free-text filter when UI adds one later. */
  query: string;
};

export function createReportsWorkspaceSlice(
  from: string,
  to: string,
): ReportsWorkspaceSlice {
  return { from, to };
}

export function createAuditWorkspaceSlice(): AuditWorkspaceSlice {
  return { query: '' };
}

export type CustomersWorkspaceSlice = {
  search: string;
  selectedIds: string[];
};

export type ContractsWorkspaceSlice = {
  selectedIds: string[];
};

export type RateCardsWorkspaceSlice = {
  navLevel: string;
  selectedHandling: string | null;
  selectedCustomerCode: string | null;
  selectedAircraftType: string | null;
  /** Price-card airline entry id when drilled in. */
  selectedPriceCardEntryId: string | null;
  customerFilter: string;
  serviceFilter: string;
  appliedCustomer: string;
  appliedService: string;
  rateCardSearch: string;
  bhsTableAircraftFilter: string;
  selectedIds: string[];
};

export type ServiceCatalogWorkspaceSlice = {
  category: string;
  search: string;
  selectedIds: string[];
};

export type ConcessionsWorkspaceSlice = {
  stationFilter: string;
  search: string;
};

export function createCustomersWorkspaceSlice(): CustomersWorkspaceSlice {
  return { search: '', selectedIds: [] };
}

export function createContractsWorkspaceSlice(): ContractsWorkspaceSlice {
  return { selectedIds: [] };
}

export function createRateCardsWorkspaceSlice(): RateCardsWorkspaceSlice {
  return {
    navLevel: 'categories',
    selectedHandling: null,
    selectedCustomerCode: null,
    selectedAircraftType: null,
    selectedPriceCardEntryId: null,
    customerFilter: '',
    serviceFilter: '',
    appliedCustomer: '',
    appliedService: '',
    rateCardSearch: '',
    bhsTableAircraftFilter: '',
    selectedIds: [],
  };
}

export function createServiceCatalogWorkspaceSlice(): ServiceCatalogWorkspaceSlice {
  return { category: '', search: '', selectedIds: [] };
}

export function createConcessionsWorkspaceSlice(): ConcessionsWorkspaceSlice {
  return { stationFilter: '', search: '' };
}
