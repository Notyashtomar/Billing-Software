/**
 * Station-scoped demo KPIs for Billing Insights dashboards (v1 — client only).
 * Replace with Nest APIs in a later pass.
 */

export function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export type SparkPoint = { label: string; value: number };

export type KpiItem = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  href?: string;
  /** When set, KPI value counts up from 0 on load */
  countTo?: number;
  countFormat?: 'int' | 'inr' | 'pct' | 'plain';
  countDecimals?: number;
};

export type MarketingDraftStageKey = 'creation' | 'approval' | 'collection';

export type MarketingDraftStage = {
  key: MarketingDraftStageKey;
  label: string;
  at: string;
  duration?: string;
  status: 'done' | 'current' | 'pending';
};

export type MarketingDraftLifecycle = {
  id: string;
  title: string;
  customer: string;
  ref: string;
  amount: number;
  currentLabel: string;
  stages: MarketingDraftStage[];
};

export type ListRow = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  href?: string;
};

export type CtaLink = {
  href: string;
  label: string;
  description: string;
};

export const MARKETING_MOCK = {
  heroValue: 42_85_000,
  heroLabel: 'MTD marketing-attributed revenue',
  spark: [
    { label: 'W1', value: 6.2 },
    { label: 'W2', value: 7.1 },
    { label: 'W3', value: 8.4 },
    { label: 'W4', value: 9.8 },
    { label: 'W5', value: 11.2 },
  ] as SparkPoint[],
  kpis: [
    {
      id: 'camp',
      label: 'Active campaigns',
      value: '12',
      hint: '3 launching this week',
      countTo: 12,
      countFormat: 'int',
    },
    {
      id: 'ads',
      label: 'ADS brief volume',
      value: '330',
      hint: 'Ops captured MTD',
      countTo: 330,
      countFormat: 'int',
    },
    {
      id: 'conv',
      label: 'Conversion',
      value: '18.4%',
      hint: 'Brief → invoice',
      countTo: 18.4,
      countFormat: 'pct',
      countDecimals: 1,
    },
    {
      id: 'pipe',
      label: 'Pipeline value',
      value: formatInr(1_12_00_000),
      hint: 'Open opportunities',
      countTo: 1_12_00_000,
      countFormat: 'inr',
    },
  ] as KpiItem[],
  drafts: [
    {
      id: 'd1',
      title: 'IndiGo ADS summer push',
      customer: 'IndiGo',
      ref: 'DRF-IXC-2401',
      amount: 4_85_000,
      currentLabel: 'In collection',
      stages: [
        {
          key: 'creation',
          label: 'Creation',
          at: '12 Jul · 09:40',
          duration: 'Draft opened',
          status: 'done',
        },
        {
          key: 'approval',
          label: 'Approval',
          at: '14 Jul · 16:05',
          duration: '2d 6h in review',
          status: 'done',
        },
        {
          key: 'collection',
          label: 'Collection',
          at: '18 Jul · 11:20',
          duration: 'Posted · awaiting remittance',
          status: 'current',
        },
      ],
    },
    {
      id: 'd2',
      title: 'Air India BHS campaign',
      customer: 'Air India',
      ref: 'DRF-IXC-2408',
      amount: 2_10_000,
      currentLabel: 'Awaiting approval',
      stages: [
        {
          key: 'creation',
          label: 'Creation',
          at: '09 Aug · 14:12',
          duration: 'Brief → draft',
          status: 'done',
        },
        {
          key: 'approval',
          label: 'Approval',
          at: 'In checker queue',
          duration: '1d 4h so far',
          status: 'current',
        },
        {
          key: 'collection',
          label: 'Collection',
          at: '—',
          duration: 'After post',
          status: 'pending',
        },
      ],
    },
    {
      id: 'd3',
      title: 'SpiceJet equipment promo',
      customer: 'SpiceJet',
      ref: 'DRF-IXC-2412',
      amount: 1_35_000,
      currentLabel: 'Just created',
      stages: [
        {
          key: 'creation',
          label: 'Creation',
          at: '10 Aug · 08:55',
          duration: 'Maker drafting',
          status: 'current',
        },
        {
          key: 'approval',
          label: 'Approval',
          at: '—',
          duration: 'Not started',
          status: 'pending',
        },
        {
          key: 'collection',
          label: 'Collection',
          at: '—',
          duration: 'Not started',
          status: 'pending',
        },
      ],
    },
  ] as MarketingDraftLifecycle[],
  campaignStack: [
    { name: 'ADS', billed: 120, pipeline: 45 },
    { name: 'BHS', billed: 86, pipeline: 22 },
    { name: 'Equip', billed: 54, pipeline: 18 },
    { name: 'Manpower', billed: 40, pipeline: 12 },
    { name: 'Custom', billed: 28, pipeline: 30 },
  ],
  channelMix: [
    { name: 'Airline sales', value: 42, fill: '#1C0770' },
    { name: 'ADS ops', value: 28, fill: '#261CC1' },
    { name: 'Station walk-in', value: 18, fill: '#F1FF5E' },
    { name: 'Partner', value: 12, fill: '#3A9AFF' },
  ],
  weeklyTrend: [
    { week: 'W1', leads: 40, invoices: 12 },
    { week: 'W2', leads: 52, invoices: 18 },
    { week: 'W3', leads: 48, invoices: 21 },
    { week: 'W4', leads: 61, invoices: 26 },
    { week: 'W5', leads: 70, invoices: 31 },
  ],
  topCustomers: [
    {
      id: '1',
      title: 'IndiGo',
      subtitle: 'Airline · ADS + BHS',
      meta: formatInr(18_40_000),
      tone: 'success' as const,
    },
    {
      id: '2',
      title: 'Air India',
      subtitle: 'Airline · BHS',
      meta: formatInr(9_20_000),
    },
    {
      id: '3',
      title: 'SpiceJet',
      subtitle: 'Airline · Equipment',
      meta: formatInr(6_10_000),
    },
    {
      id: '4',
      title: 'Akasa Air',
      subtitle: 'Airline · Manpower',
      meta: formatInr(4_80_000),
    },
  ] as ListRow[],
  ctas: [
    {
      href: '/billing/ads',
      label: 'Open ADS',
      description: 'Capture marketing-sourced ADS briefs',
    },
    {
      href: '/billing/contracts',
      label: 'Contracts',
      description: 'Rate cards tied to campaigns',
    },
  ] as CtaLink[],
};

export const PAYABLES_MOCK = {
  heroValue: 18_65_000,
  heroLabel: 'Open payables total',
  spark: [
    { label: 'M1', value: 22 },
    { label: 'M2', value: 20 },
    { label: 'M3', value: 19 },
    { label: 'M4', value: 18.6 },
  ] as SparkPoint[],
  kpis: [
    {
      id: 'due',
      label: 'Due this week',
      value: formatInr(3_25_000),
      tone: 'warning' as const,
      href: '/billing/concessions',
    },
    {
      id: 'od',
      label: 'Overdue',
      value: formatInr(1_10_000),
      tone: 'danger' as const,
      hint: '2 obligations',
      href: '/billing/reports',
    },
    {
      id: 'conc',
      label: 'Concession payable',
      value: formatInr(8_40_000),
      href: '/billing/concessions',
    },
    {
      id: 'settled',
      label: 'Settled MTD',
      value: formatInr(12_50_000),
      tone: 'success' as const,
      href: '/billing/invoices?status=posted',
    },
  ] as KpiItem[],
  aging: [
    { bucket: '0–30', amount: 7.2 },
    { bucket: '31–60', amount: 5.1 },
    { bucket: '61–90', amount: 3.8 },
    { bucket: '90+', amount: 2.5 },
  ],
  byCategory: [
    { name: 'Concession', amount: 8.4 },
    { name: 'Airport fees', amount: 4.2 },
    { name: 'Vendor GSE', amount: 3.1 },
    { name: 'Other', amount: 2.9 },
  ],
  statusMix: [
    { name: 'Open', value: 55, fill: '#1C0770' },
    { name: 'Due soon', value: 22, fill: '#F1FF5E' },
    { name: 'Overdue', value: 12, fill: '#B91C1C' },
    { name: 'Settled', value: 11, fill: '#166534' },
  ],
  obligations: [
    {
      id: '1',
      title: 'AAI concession — Jul',
      subtitle: 'Due 12 Aug · Station IXC',
      meta: formatInr(4_20_000),
      tone: 'warning' as const,
      href: '/billing/concessions',
    },
    {
      id: '2',
      title: 'Airport operator fee',
      subtitle: 'Due 18 Aug',
      meta: formatInr(1_85_000),
      href: '/billing/settings',
    },
    {
      id: '3',
      title: 'GSE hire settlement',
      subtitle: 'Overdue 5 days',
      meta: formatInr(95_000),
      tone: 'danger' as const,
      href: '/billing/equipment',
    },
    {
      id: '4',
      title: 'Royalty remittance',
      subtitle: 'Due 28 Aug',
      meta: formatInr(2_40_000),
      href: '/billing/reports',
    },
  ] as ListRow[],
  ctas: [
    {
      href: '/billing/concessions',
      label: 'Concessions',
      description: 'Concession fee setup & rules',
    },
    {
      href: '/billing/customers',
      label: 'Customers',
      description: 'Bill-to masters & active status',
    },
    {
      href: '/billing/contracts',
      label: 'Contracts',
      description: 'Rate cards & commercial terms',
    },
    {
      href: '/billing/preparation',
      label: 'Preparation',
      description: 'Maker queue — ready for drafts',
    },
    {
      href: '/billing/review',
      label: 'Review',
      description: 'Checker approval queue',
    },
    {
      href: '/billing/invoices',
      label: 'Invoices',
      description: 'Posted & open documents',
    },
    {
      href: '/billing/settings',
      label: 'Station profile',
      description: 'Bank / payable text',
    },
    {
      href: '/billing/billed-services',
      label: 'Billed services',
      description: 'Ops capture dashboard',
    },
    {
      href: '/billing/reports',
      label: 'Reports',
      description: 'Export payable summaries',
    },
  ] as CtaLink[],
};

export const RECEIVABLES_MOCK = {
  heroValue: 1_48_92_045,
  heroLabel: 'Total outstanding receivable',
  spark: [
    { label: 'W1', value: 152 },
    { label: 'W2', value: 150 },
    { label: 'W3', value: 149 },
    { label: 'W4', value: 148.9 },
  ] as SparkPoint[],
  kpis: [
    {
      id: 'posted',
      label: 'Posted MTD',
      value: formatInr(62_40_000),
      tone: 'success' as const,
    },
    {
      id: 'od',
      label: 'Overdue',
      value: formatInr(18_20_000),
      tone: 'danger' as const,
    },
    { id: 'dso', label: 'DSO', value: '42 days', hint: 'Target ≤ 35' },
    {
      id: 'coll',
      label: 'Collection %',
      value: '78%',
      tone: 'success' as const,
    },
  ] as KpiItem[],
  aging: [
    { bucket: 'Current', amount: 68 },
    { bucket: '1–30', amount: 42 },
    { bucket: '31–60', amount: 22 },
    { bucket: '61–90', amount: 10 },
    { bucket: '90+', amount: 6.9 },
  ],
  monthly: [
    { month: 'Apr', billed: 48, collected: 41 },
    { month: 'May', billed: 52, collected: 46 },
    { month: 'Jun', billed: 55, collected: 49 },
    { month: 'Jul', billed: 61, collected: 52 },
    { month: 'Aug', billed: 58, collected: 38 },
  ],
  concentration: [
    { name: 'IndiGo', value: 34, fill: '#1C0770' },
    { name: 'Air India', value: 22, fill: '#261CC1' },
    { name: 'SpiceJet', value: 16, fill: '#F1FF5E' },
    { name: 'Others', value: 28, fill: '#3A9AFF' },
  ],
  recent: [
    {
      id: '1',
      title: 'INV-IXC-0842 · IndiGo',
      subtitle: 'Posted · Due 20 Aug',
      meta: formatInr(4_85_000),
      tone: 'success' as const,
    },
    {
      id: '2',
      title: 'INV-IXC-0831 · Air India',
      subtitle: 'Overdue 8 days',
      meta: formatInr(2_10_000),
      tone: 'danger' as const,
    },
    {
      id: '3',
      title: 'INV-IXC-0828 · SpiceJet',
      subtitle: 'Posted · Due 25 Aug',
      meta: formatInr(1_65_000),
    },
    {
      id: '4',
      title: 'CM-IXC-0041 · IndiGo',
      subtitle: 'Credit memo draft',
      meta: `−${formatInr(42_000)}`,
      tone: 'warning' as const,
    },
  ] as ListRow[],
  ctas: [
    {
      href: '/billing/invoices',
      label: 'Invoices',
      description: 'Posted & open AR',
    },
    {
      href: '/billing/review',
      label: 'Review',
      description: 'Checker queue',
    },
    {
      href: '/billing/credit-memos',
      label: 'Credit memos',
      description: 'Adjustments',
    },
  ] as CtaLink[],
};
