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
      detail: `${aircraft ? `${aircraft}. ` : ''}${
        contractNumber ? `Contract ${contractNumber}. ` : ''
      }The saved rate is ${money(listed, currency)}${from ? `, valid from ${from}` : ''}.`,
    });
  } else if (packageRate != null) {
    steps.push({
      title: 'Price on this line',
      detail: `${aircraft ? `${aircraft}. ` : ''}The package rate saved with this line is ${money(packageRate, currency)}.`,
    });
  } else {
    steps.push({
      title: 'Rate on this line',
      detail: `The unit rate is ${money(line.unitPrice, currency)}.`,
    });
  }

  if (!annual && origin?.yearlyClause === false && listed != null) {
    const contractNumber = String(origin.contractNumber ?? '').trim();
    steps.push({
      title: 'Yearly increase',
      detail: `${
        contractNumber ? `Contract ${contractNumber} has` : 'The contract used for this flight has'
      } no yearly-increase clause, so the listed price ${money(listed, currency)} is the rate.`,
    });
  }

  if (annual && listed != null) {
    const percent = num(annual.percent) ?? 0;
    const appliedSteps = num(annual.steps) ?? 0;
    const priceAfter = num(annual.priceAfter) ?? afterAnnual ?? listed;
    const label = String(annual.label || 'Current-year rates');
    const starts = String(annual.increaseStarts || annual.validFrom || '');
    if (appliedSteps > 0 && priceAfter !== listed) {
      steps.push({
        title: `Clause “${label}”`,
        detail: `From ${starts}, this rate increases by ${percent}% a year. This flight is step ${appliedSteps}: ${money(listed, currency)} × (1 + ${percent}/100)^${appliedSteps} = ${money(priceAfter, currency)}.`,
      });
    } else if (appliedSteps > 0) {
      steps.push({
        title: `Clause “${label}”`,
        detail: `The ${percent}% yearly increase from ${starts} is already inside the saved price for ${appliedSteps} step${appliedSteps === 1 ? '' : 's'}. The rate stays ${money(priceAfter, currency)}.`,
      });
    } else {
      steps.push({
        title: `Clause “${label}”`,
        detail: `This clause raises the listed price by ${percent}% a year from ${starts}. This flight is before that date, so the rate stays ${money(listed, currency)}.`,
      });
    }
  }

  if (ref.incrementalPriceApplied === true) {
    const incremental = num(origin?.incrementalPrice) ?? line.unitPrice;
    steps.push({
      title: 'Incremental flight',
      detail: `This flight uses the incremental price on the card, ${money(incremental, currency)}, in place of the full package rate.`,
    });
  }

  if (ref.bhsVolumeOverride === true) {
    const saved = num(ref.savedComprehensiveRate);
    const fromCount = ref.bhsVolumeFromCount ?? '';
    const toCount = ref.bhsVolumeToCount ?? 'open';
    steps.push({
      title: 'Volume band',
      detail: `The flight count is in band ${fromCount}–${toCount}${
        ref.bhsVolumeScope ? ` (${String(ref.bhsVolumeScope)})` : ''
      }. ${
        saved != null
          ? `The card rate ${money(saved, currency)} is replaced by the band price.`
          : 'The band price replaces the card rate.'
      }`,
    });
  }

  if (ref.splitTurnaround) {
    const base = num(ref.splitBaseRate);
    const extra = num(ref.splitAdditionalPercent) ?? 0;
    steps.push({
      title: 'Split turnaround',
      detail: `${String(ref.splitBaseScope ?? 'Base')} rate ${
        base != null ? money(base, currency) : '—'
      } plus ${extra}% for ${String(ref.splitTurnaround)}.`,
    });
  }

  const chargePercent = num(ref.concessionPercent);
  if (ref.concessionAppliedToUnitPrice === true && chargePercent != null) {
    const base = packageRate ?? afterAnnual ?? listed;
    steps.push({
      title: scenarioLabel(String(ref.flightScenario ?? '')),
      detail: `The contract charges ${chargePercent}% of the package rate${
        base != null ? ` (${money(base, currency)} × ${chargePercent}% = ${money((base * chargePercent) / 100, currency)})` : ''
      }.`,
    });
  }

  const added = num(ref.additionalChargePercent);
  if (added != null && added > 0) {
    steps.push({
      title: ref.groundSurchargeApplied === true ? 'Extra ground time' : 'Added percent',
      detail:
        ref.groundSurchargeApplied === true
          ? `Ground time is beyond 75 minutes, so ${added}% is added on top of the rate.`
          : `${added}% is added on top of the rate for late arrival, remain overnight, delay, or extra ground time.`,
    });
  }

  const cancellation = num(ref.cancellationChargeablePercent);
  if (cancellation != null) {
    steps.push({
      title: 'Cancellation',
      detail: `The cancellation clause keeps ${cancellation}% of the rate.`,
    });
  }

  steps.push({
    title: 'Rate/Unit',
    detail: money(line.unitPrice, currency),
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
              <span className="font-semibold text-[color:var(--billing-heading)]">
                {index + 1}. {step.title}
              </span>
              <p className="mt-0.5">{step.detail}</p>
            </li>
          ))}
        </ol>
      </HoverCardContent>
    </HoverCard>
  );
}
