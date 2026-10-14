'use client';

import type { BillingApi } from '@/lib/billing-api';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { formatInr, PAYABLES_MOCK } from './insightsMock';
import { PayablesCommandCenterPanel } from './PayablesCommandCenterPanel';
import {
  DonutChart,
  InsightsChartCard,
  InsightsCtaRow,
  InsightsHero,
  InsightsKpiStrip,
  InsightsListCard,
  INSIGHT_COLORS,
  SimpleBarChart,
} from './shared/InsightsWidgets';

type Props = {
  api: BillingApi;
};

export function PayablesInsightsDashboard({ api }: Props) {
  const m = PAYABLES_MOCK;
  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title="Payables Insights"
        description="Obligations out — plus live command funnel and actionable tiles"
      />
      <div className="space-y-4 sm:space-y-5">
        <PayablesCommandCenterPanel api={api} />
        <InsightsHero
          label={m.heroLabel}
          value={m.heroValue}
          valueFormatted={formatInr(m.heroValue)}
          spark={m.spark}
        />
        <InsightsKpiStrip items={m.kpis} />
        <div className="grid gap-4 lg:grid-cols-3">
          <InsightsChartCard title="Aging (₹ lakhs)">
            <SimpleBarChart
              data={m.aging}
              xKey="bucket"
              yKey="amount"
              color={INSIGHT_COLORS.BLUE}
            />
          </InsightsChartCard>
          <InsightsChartCard title="By category (₹ lakhs)">
            <SimpleBarChart
              data={m.byCategory}
              xKey="name"
              yKey="amount"
              color={INSIGHT_COLORS.NAVY}
            />
          </InsightsChartCard>
          <InsightsChartCard title="Status mix">
            <DonutChart data={m.statusMix} />
          </InsightsChartCard>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <InsightsListCard title="Upcoming obligations" rows={m.obligations} />
          <div className="space-y-3">
            <h2 className={billingUi.sectionTitle}>Shortcuts</h2>
            <InsightsCtaRow links={m.ctas} />
            <p className="text-xs text-[color:var(--billing-text-muted)]">
              Payables charts use demo KPIs — command strip above is live Nest data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
