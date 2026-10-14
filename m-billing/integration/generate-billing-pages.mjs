#!/usr/bin/env node
/**
 * Generate billing route page.tsx stubs into m-billing client app tree.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outRoot = resolve(__dirname, '../client/app/billing');

const routes = [
  { folder: 'dashboard', importPath: '@/components/billing/dashboard/BillingDashboardPage', exportName: 'BillingDashboardPage' },
  { folder: 'preparation', importPath: '@/components/billing/preparation/PreparationPage', exportName: 'PreparationPage' },
  { folder: 'invoice-drafts', importPath: '@/components/billing/invoices/InvoiceWorkflowPages', exportName: 'InvoiceDraftsPage' },
  { folder: 'review', importPath: '@/components/billing/invoices/InvoiceWorkflowPages', exportName: 'InvoiceReviewPage' },
  { folder: 'invoices', importPath: '@/components/billing/invoices/InvoiceWorkflowPages', exportName: 'InvoicesListPage' },
  { folder: 'credit-memos', importPath: '@/components/billing/output/OutputPages', exportName: 'CreditMemosPage' },
  { folder: 'backing-sheets', importPath: '@/components/billing/output/OutputPages', exportName: 'BackingSheetsPage' },
  { folder: 'reports', importPath: '@/components/billing/output/OutputPages', exportName: 'ReportsPage' },
  { folder: 'audit', importPath: '@/components/billing/output/OutputPages', exportName: 'AuditPage' },
  { folder: 'cutover', importPath: '@/components/billing/cutover/CutoverPage', exportName: 'CutoverPage' },
  { folder: 'parallel-run', importPath: '@/components/billing/parallel-run/ParallelRunPage', exportName: 'ParallelRunPage' },
  { folder: 'decommission', importPath: '@/components/billing/decommission/DecommissionPage', exportName: 'DecommissionPage' },
  { folder: 'customers', importPath: '@/components/billing/customers/CustomersPage', exportName: 'CustomersPage' },
  { folder: 'service-catalog', importPath: '@/components/billing/service-catalog/ServiceCatalogPage', exportName: 'ServiceCatalogPage' },
  { folder: 'contracts', importPath: '@/components/billing/contracts/ContractsPage', exportName: 'ContractsPage' },
  { folder: 'rate-cards', importPath: '@/components/billing/contracts/ContractsPage', exportName: 'RateCardsPage' },
  { folder: 'conversion-rates', importPath: '@/components/billing/settings/ConversionRatesPage', exportName: 'ConversionRatesPage' },
  { folder: 'settings/taxes', importPath: '@/components/billing/settings/SettingsPages', exportName: 'TaxRulesPage' },
  { folder: 'settings/currency', importPath: '@/components/billing/settings/SettingsPages', exportName: 'CurrencyPage' },
  { folder: 'settings/sequences', importPath: '@/components/billing/settings/SettingsPages', exportName: 'SequencesPage' },
  { folder: 'scheduled-flights', importPath: '@/components/billing/sources/SourcePages', exportName: 'ScheduledFlightsSourcePage' },
  { folder: 'cleaning', importPath: '@/components/billing/sources/SourcePages', exportName: 'CleaningSourcePage' },
  { folder: 'raf', importPath: '@/components/billing/sources/SourcePages', exportName: 'RafSourcePage' },
  { folder: 'maas', importPath: '@/components/billing/sources/SourcePages', exportName: 'MaasSourcePage' },
  { folder: 'ads', importPath: '@/components/billing/sources/SourcePages', exportName: 'AdsSourcePage' },
  { folder: 'xxld-scheduled', importPath: '@/components/billing/sources/SourcePages', exportName: 'XxldScheduledSourcePage' },
  { folder: 'xxld-non-scheduled', importPath: '@/components/billing/sources/SourcePages', exportName: 'XxldNonScheduledSourcePage' },
  { folder: 'equipment', importPath: '@/components/billing/sources/SourcePages', exportName: 'EquipmentSourcePage' },
  { folder: 'manpower', importPath: '@/components/billing/sources/SourcePages', exportName: 'ManpowerSourcePage' },
  { folder: 'non-scheduled', importPath: '@/components/billing/sources/SourcePages', exportName: 'NonScheduledSourcePage' },
];

function pageContent(importPath, exportName) {
  return `'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { BillingLayout } from '@/components/billing/BillingLayout';
import { billingApi } from '@/lib/billing-api';

const PageComponent = dynamic(
  () => import('${importPath}').then((m) => m.${exportName}),
  { ssr: false },
);

export default function Page() {
  return (
    <BillingLayout>
      <Suspense fallback={null}>
        <PageComponent api={billingApi} />
      </Suspense>
    </BillingLayout>
  );
}
`;
}

for (const route of routes) {
  const dir = resolve(outRoot, route.folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'page.tsx'), pageContent(route.importPath, route.exportName));
  console.log('Wrote', route.folder);
}

console.log('Done —', routes.length, 'billing pages');
