'use client';

import type { BillingApi } from '@/lib/billing-api';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { formatInr, MARKETING_MOCK } from './insightsMock';
import { SetupReadinessChecklist } from './SetupReadinessChecklist';
import { MarketingDraftLifecyclePanel } from './MarketingDraftLifecyclePanel';
import { OpenKycCasesPanel } from './OpenKycCasesPanel';
import {
  DonutChart,
  DualLineChart,
  InsightsChartCard,
  InsightsCtaRow,
  InsightsHero,
  InsightsKpiStrip,
  InsightsListCard,
  INSIGHT_COLORS,
  StackedBarChart,
} from './shared/InsightsWidgets';

type Props = {
  api: BillingApi;
};

export function MarketingInsightsDashboard({ api }: Props) {
  const m = MARKETING_MOCK;
  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title="Marketing Insights"
        description="Campaign pipeline → billed services — draft lifecycle, setup readiness, commercial signal"
      />
      <div className="space-y-4 sm:space-y-5">
        <div className="billing-tile-enter">
          <SetupReadinessChecklist api={api} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
          <InsightsHero
            label={m.heroLabel}
            value={m.heroValue}
            valueFormatted={formatInr(m.heroValue)}
            spark={m.spark}
          />
          <OpenKycCasesPanel api={api} />
        </div>
        <InsightsKpiStrip items={m.kpis} />
        <MarketingDraftLifecyclePanel drafts={m.drafts} />
        <div className="grid gap-4 billing-tile-enter billing-tile-enter-delay-3 lg:grid-cols-3">
          <InsightsChartCard title="Campaign → billed services" className="lg:col-span-1">
            <StackedBarChart
              data={m.campaignStack}
              stackedKeys={[
                { key: 'billed', name: 'Billed', color: INSIGHT_COLORS.BLUE },
                { key: 'pipeline', name: 'Pipeline', color: INSIGHT_COLORS.YELLOW },
              ]}
            />
          </InsightsChartCard>
          <InsightsChartCard title="Channel mix">
            <DonutChart data={m.channelMix} />
          </InsightsChartCard>
          <InsightsChartCard title="Weekly leads → invoices">
            <DualLineChart
              data={m.weeklyTrend}
              xKey="week"
              series={[
                { key: 'leads', name: 'Leads', color: INSIGHT_COLORS.BLUE },
                { key: 'invoices', name: 'Invoices', color: INSIGHT_COLORS.NAVY },
              ]}
            />
          </InsightsChartCard>
        </div>
        <div className="grid gap-4 billing-tile-enter billing-tile-enter-delay-4 lg:grid-cols-2">
          <InsightsListCard
            title="Top customers by marketing volume"
            rows={m.topCustomers}
          />
          <div className="space-y-3">
            <h2 className={billingUi.sectionTitle}>Shortcuts</h2>
            <InsightsCtaRow links={m.ctas} />
            <p className="text-xs text-[color:var(--billing-text-muted)]">
              Demo data only — wire Nest billing APIs in a later pass.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
