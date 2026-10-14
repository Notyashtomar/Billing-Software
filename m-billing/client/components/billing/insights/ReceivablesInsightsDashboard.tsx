'use client';

import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { formatInr, RECEIVABLES_MOCK } from './insightsMock';
import {
  DonutChart,
  GroupedBarChart,
  InsightsChartCard,
  InsightsCtaRow,
  InsightsHero,
  InsightsKpiStrip,
  InsightsListCard,
  INSIGHT_COLORS,
  SimpleBarChart,
} from './shared/InsightsWidgets';

export function ReceivablesInsightsDashboard() {
  const m = RECEIVABLES_MOCK;
  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title="Receivables Insights"
        description="Money in — outstanding AR, collections, and overdue risk (demo KPIs)"
      />
      <div className="space-y-4 sm:space-y-5">
        <InsightsHero
          label={m.heroLabel}
          value={m.heroValue}
          valueFormatted={formatInr(m.heroValue)}
          spark={m.spark}
        />
        <InsightsKpiStrip items={m.kpis} />
        <div className="grid gap-4 lg:grid-cols-3">
          <InsightsChartCard title="AR aging (₹ lakhs)">
            <SimpleBarChart
              data={m.aging}
              xKey="bucket"
              yKey="amount"
              color={INSIGHT_COLORS.BLUE}
            />
          </InsightsChartCard>
          <InsightsChartCard title="Monthly billed vs collected (₹ L)">
            <GroupedBarChart
              data={m.monthly}
              xKey="month"
              series={[
                { key: 'billed', name: 'Billed', color: INSIGHT_COLORS.BLUE },
                { key: 'collected', name: 'Collected', color: INSIGHT_COLORS.YELLOW },
              ]}
            />
          </InsightsChartCard>
          <InsightsChartCard title="Customer concentration">
            <DonutChart data={m.concentration} />
          </InsightsChartCard>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <InsightsListCard title="Recent invoices / adjustments" rows={m.recent} />
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
