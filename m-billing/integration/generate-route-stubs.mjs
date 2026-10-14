#!/usr/bin/env node
/**
 * Emit Next.js page stubs under client/app/billing/ from routes.integration.ts list.
 * Usage: node BWMS/modules/m-billing/integration/generate-route-stubs.mjs [--out=...]
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outRoot = resolve(
  outArg?.split('=')[1] ?? resolve(__dirname, '../client/app/billing'),
);

const routes = [
  { path: '/billing/dashboard', component: 'BillingDashboardPage', folder: 'dashboard' },
  { path: '/billing/preparation', component: 'PreparationPage', folder: 'preparation' },
  { path: '/billing/invoice-drafts', component: 'InvoiceDraftsPage', folder: 'invoice-drafts' },
  { path: '/billing/review', component: 'ReviewPage', folder: 'review' },
  { path: '/billing/invoices', component: 'InvoicesPage', folder: 'invoices' },
  { path: '/billing/credit-memos', component: 'CreditMemosPage', folder: 'credit-memos' },
  { path: '/billing/backing-sheets', component: 'BackingSheetsPage', folder: 'backing-sheets' },
  { path: '/billing/reports', component: 'ReportsPage', folder: 'reports' },
  { path: '/billing/audit', component: 'AuditPage', folder: 'audit' },
  { path: '/billing/cutover', component: 'CutoverPage', folder: 'cutover' },
  { path: '/billing/parallel-run', component: 'ParallelRunPage', folder: 'parallel-run' },
  { path: '/billing/decommission', component: 'DecommissionPage', folder: 'decommission' },
  { path: '/billing/customers', component: 'CustomersPage', folder: 'customers' },
  { path: '/billing/service-catalog', component: 'ServiceCatalogPage', folder: 'service-catalog' },
  { path: '/billing/contracts', component: 'ContractsPage', folder: 'contracts' },
  { path: '/billing/rate-cards', component: 'RateCardsPage', folder: 'rate-cards' },
  { path: '/billing/settings/taxes', component: 'TaxRulesPage', folder: 'settings/taxes' },
  { path: '/billing/settings/currency', component: 'CurrencyPage', folder: 'settings/currency' },
  { path: '/billing/settings/sequences', component: 'SequencesPage', folder: 'settings/sequences' },
  { path: '/billing/scheduled-flights', component: 'ScheduledFlightsPage', folder: 'scheduled-flights' },
  { path: '/billing/cleaning', component: 'CleaningPage', folder: 'cleaning' },
  { path: '/billing/raf', component: 'RafPage', folder: 'raf' },
  { path: '/billing/maas', component: 'MaasPage', folder: 'maas' },
  { path: '/billing/ads', component: 'AdsPage', folder: 'ads' },
  { path: '/billing/xxld-scheduled', component: 'XxldScheduledPage', folder: 'xxld-scheduled' },
  { path: '/billing/xxld-non-scheduled', component: 'XxldNonScheduledPage', folder: 'xxld-non-scheduled' },
  { path: '/billing/equipment', component: 'EquipmentPage', folder: 'equipment' },
  { path: '/billing/manpower', component: 'ManpowerPage', folder: 'manpower' },
  { path: '/billing/non-scheduled', component: 'NonScheduledPage', folder: 'non-scheduled' },
];

const importPaths = {
  BillingDashboardPage: '@/components/billing/dashboard/BillingDashboardPage',
  PreparationPage: '@/components/billing/preparation/PreparationPage',
  InvoiceDraftsPage: '@/components/billing/invoices/InvoiceWorkflowPages',
  ReviewPage: '@/components/billing/invoices/InvoiceWorkflowPages',
  InvoicesPage: '@/components/billing/invoices/InvoiceWorkflowPages',
  CreditMemosPage: '@/components/billing/output/OutputPages',
  BackingSheetsPage: '@/components/billing/output/OutputPages',
  ReportsPage: '@/components/billing/output/OutputPages',
  AuditPage: '@/components/billing/output/OutputPages',
  CutoverPage: '@/components/billing/cutover/CutoverPage',
  ParallelRunPage: '@/components/billing/parallel-run/ParallelRunPage',
  DecommissionPage: '@/components/billing/decommission/DecommissionPage',
  CustomersPage: '@/components/billing/customers/CustomersPage',
  ServiceCatalogPage: '@/components/billing/catalog/ServiceCatalogPage',
  ContractsPage: '@/components/billing/contracts/ContractsPage',
  RateCardsPage: '@/components/billing/contracts/RateCardsPage',
  TaxRulesPage: '@/components/billing/settings/TaxRulesPage',
  CurrencyPage: '@/components/billing/settings/CurrencyPage',
  SequencesPage: '@/components/billing/settings/SequencesPage',
  ScheduledFlightsPage: '@/components/billing/sources/SourcePages',
  CleaningPage: '@/components/billing/sources/SourcePages',
  RafPage: '@/components/billing/sources/SourcePages',
  MaasPage: '@/components/billing/sources/SourcePages',
  AdsPage: '@/components/billing/sources/SourcePages',
  XxldScheduledPage: '@/components/billing/sources/SourcePages',
  XxldNonScheduledPage: '@/components/billing/sources/SourcePages',
  EquipmentPage: '@/components/billing/sources/SourcePages',
  ManpowerPage: '@/components/billing/sources/SourcePages',
  NonScheduledPage: '@/components/billing/sources/SourcePages',
};

function pageContent(component, importPath, exportName) {
  return `'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { BillingLayout } from '@/components/billing/BillingLayout';
import { createBillingApi } from '@/lib/billing-api';
import { getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';

const PageComponent = dynamic(
  () => import('${importPath}').then((m) => m.${exportName}),
  { ssr: false },
);

const api = createBillingApi({ getApiBase, fetch: frisFetch });

export default function Page() {
  return (
    <BillingLayout>
      <Suspense fallback={null}>
        <PageComponent api={api} />
      </Suspense>
    </BillingLayout>
  );
}
`;
}

let written = 0;
for (const route of routes) {
  const dir = resolve(outRoot, route.folder);
  const file = resolve(dir, 'page.tsx');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const importPath = importPaths[route.component];
  const exportName = route.component;
  writeFileSync(file, pageContent(route.component, importPath, exportName));
  written += 1;
  console.log('Wrote', file);
}

console.log(`Done — ${written} pages under ${outRoot}`);
