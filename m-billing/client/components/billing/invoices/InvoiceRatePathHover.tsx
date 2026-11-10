'use client';

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

type RateLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineDiscountPercent?: number;
  lineAmountExclTax: number;
  sourceType?: string;
  serviceCode?: string;
  sourceRef?: Record<string, unknown>;
};

type Step = {
  title: string;
  detail: string;
  figure: string;
};

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function scenarioLabel(value: string): string {
  switch (value) {
    case 'diverted':
      return 'Diverted flight';
    case 'returnToRamp':
      return 'Return to ramp';
    case 'technical':
      return 'Technical landing';
    case 'standby':
      return 'Standby';
    default:
      return 'Handling condition';
  }
}

export function buildInvoiceRateSteps(line: RateLine, currency: string): Step[] {
  const ref = line.sourceRef ?? {};
  const origin =
    ref.rateOrigin && typeof ref.rateOrigin === 'object'
      ? (ref.rateOrigin as Record<string, unknown>)
      : null;
  const annual =
    origin?.annualIncrease && typeof origin.annualIncrease === 'object'
      ? (origin.annualIncrease as Record<string, unknown>)
      : null;
  const listed = origin ? num(origin.listedPrice) : null;
  const afterAnnual = origin ? num(origin.priceAfterAnnual) : null;
  const packageRate = num(ref.bhsPackageRate) ?? num(ref.chargeAmountPerFlight);
  const aircraft = String(ref.aircraftType ?? origin?.aircraftType ?? '').trim();
  const steps: Step[] = [];

  if (listed != null) {
    const from = String(origin?.cardValidFrom ?? '').trim();
    const basis = String(origin?.pricingBasis ?? '');
    const source =
      basis === 'adhoc'
        ? 'Adhoc tariff'
        : basis === 'rate_card'
          ? 'Contract equipment rate'
          : 'Price card';
    const contractNumber = String(origin?.contractNumber ?? '').trim();
    steps.push({
      title: source,
      figure: money(listed, currency),
      detail: `${aircraft ? `${aircraft}. ` : ''}${
        contractNumber ? `${contractNumber}. ` : ''
      }${from ? `Valid from ${from}.` : 'Saved on the rate card.'}`,
    });
  } else if (packageRate != null && packageRate !== line.unitPrice) {
    steps.push({
      title: 'Price card',
      figure: money(packageRate, currency),
      detail: `${aircraft ? `${aircraft}. ` : ''}Saved on the rate card.`,
    });
  } else {
    steps.push({
      title: 'Price card',
      figure: money(line.unitPrice, currency),
      detail: `${aircraft ? `${aircraft}. ` : ''}Saved rate on this line.`,
    });
  }

  if (!annual && origin?.yearlyClause === false && listed != null) {
    const contractNumber = String(origin.contractNumber ?? '').trim();
    steps.push({
      title: 'Yearly increase',
      figure: money(listed, currency),
      detail: `${
        contractNumber ? `${contractNumber} has` : 'This contract has'
      } no yearly-increase clause. The card rate is unchanged.`,
    });
  }

  if (annual && listed != null) {
    const percent = num(annual.percent) ?? 0;
    const appliedSteps = num(annual.steps) ?? 0;
    const priceAfter = num(annual.priceAfter) ?? afterAnnual ?? listed;
    const label = String(annual.label || 'Current-year rates');
    const starts = String(annual.increaseStarts || annual.validFrom || '');
    const factor = 1 + percent / 100;
    if (appliedSteps > 0 && priceAfter !== listed) {
      const formula =
        appliedSteps === 1
          ? `${money(listed, currency)} × ${factor} = ${money(priceAfter, currency)}`
          : `${money(listed, currency)} × ${factor}^${appliedSteps} = ${money(priceAfter, currency)}`;
      steps.push({
        title: label,
        figure: money(priceAfter, currency),
        detail: `${percent}% from ${starts}. Step ${appliedSteps}. ${formula}`,
      });
    } else if (appliedSteps > 0) {
      steps.push({
        title: label,
        figure: money(priceAfter, currency),
        detail: `${percent}% from ${starts} is already inside the saved card price (${appliedSteps} step${appliedSteps === 1 ? '' : 's'}).`,
      });
    } else {
      steps.push({
        title: label,
        figure: money(listed, currency),
        detail: `${percent}% a year starts ${starts}. This flight is before that date.`,
      });
    }
  }

  if (ref.incrementalPriceApplied === true) {
    const incremental = num(origin?.incrementalPrice) ?? line.unitPrice;
    steps.push({
      title: 'Incremental flight',
      figure: money(incremental, currency),
      detail: 'The card incremental price replaces the package rate.',
    });
  }

  if (ref.bhsVolumeOverride === true) {
    const saved = num(ref.savedComprehensiveRate);
    const fromCount = ref.bhsVolumeFromCount ?? '';
    const toCount = ref.bhsVolumeToCount ?? 'open';
    steps.push({
      title: 'Volume band',
      figure: money(packageRate ?? line.unitPrice, currency),
      detail: `Band ${fromCount}–${toCount}${
        ref.bhsVolumeScope ? ` (${String(ref.bhsVolumeScope)})` : ''
      }${saved != null ? ` replaces ${money(saved, currency)}` : ''}.`,
    });
  }

  if (ref.splitTurnaround) {
    const base = num(ref.splitBaseRate);
    const extra = num(ref.splitAdditionalPercent) ?? 0;
    const splitResult = base != null ? base * (1 + extra / 100) : line.unitPrice;
    steps.push({
      title: 'Split turnaround',
      figure: money(splitResult, currency),
      detail: `${base != null ? money(base, currency) : 'Base'} + ${extra}% (${String(ref.splitTurnaround)}).`,
    });
  }

  const chargePercent = num(ref.concessionPercent);
  if (ref.concessionAppliedToUnitPrice === true && chargePercent != null) {
    const base = packageRate ?? afterAnnual ?? listed;
    const chargedRate = base != null ? (base * chargePercent) / 100 : line.unitPrice;
    steps.push({
      title: scenarioLabel(String(ref.flightScenario ?? '')),
      figure: money(chargedRate, currency),
      detail:
        base != null
          ? `${money(base, currency)} × ${chargePercent}% = ${money(chargedRate, currency)}`
          : `${chargePercent}% of the package rate.`,
    });
  }

  const added = num(ref.additionalChargePercent);
  if (added != null && added > 0) {
    steps.push({
      title: ref.groundSurchargeApplied === true ? 'Extra ground time' : 'Added percent',
      figure: `+${added}%`,
      detail:
        ref.groundSurchargeApplied === true
          ? `Ground time beyond 75 minutes adds ${added}%.`
          : `${added}% is added for late arrival, remain overnight, delay, or extra ground time.`,
    });
  }

  const cancellation = num(ref.cancellationChargeablePercent);
  if (cancellation != null) {
    steps.push({
      title: 'Cancellation',
      figure: `${cancellation}%`,
      detail: `The cancellation clause keeps ${cancellation}% of the rate.`,
    });
  }

  steps.push({
    title: 'Rate/Unit',
    figure: money(line.unitPrice, currency),
    detail: 'Rate shown on this invoice.',
  });

  return steps;
}

export function InvoiceRatePathHover({
  line,
  currency,
}: {
  line: RateLine;
  currency: string;
}) {
  const steps = buildInvoiceRateSteps(line, currency);
  const label = `Rate(${line.unitPrice.toFixed(2)})`;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="rounded bg-amber-100 px-1 font-semibold text-amber-950 underline decoration-dotted underline-offset-2 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          aria-label={`How ${label} was calculated`}
        >
          {label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        collisionPadding={16}
        sideOffset={8}
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
      >
        <div className="border-b border-[color:var(--billing-border)] px-3 py-2">
          <p className="text-xs font-semibold text-[color:var(--billing-heading)]">
            Rate breakup
          </p>
          <p className="mt-0.5 text-[11px] text-[color:var(--billing-text-muted)]">
            {line.description || 'Invoice line'}
          </p>
        </div>
        <ol className="max-h-80 space-y-2 overflow-y-auto px-3 py-2">
          {steps.map((step, index) => (
            <li key={`${step.title}-${index}`} className="text-[11px] leading-snug text-gray-800">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-[color:var(--billing-heading)]">
                  {index + 1}. {step.title}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[color:var(--billing-heading)]">
                  {step.figure}
                </span>
              </div>
              {step.detail ? <p className="mt-0.5 text-gray-600">{step.detail}</p> : null}
            </li>
          ))}
        </ol>
      </HoverCardContent>
    </HoverCard>
  );
}
