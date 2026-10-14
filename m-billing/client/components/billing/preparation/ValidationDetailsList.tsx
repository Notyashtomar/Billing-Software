'use client';

import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  getValidationGuidance,
  sortValidationResults,
  type ValidationGuidance,
  type ValidationGuidanceContext,
} from '@/lib/billing-shared/preparation-validation-guidance';
import type { ValidationResult } from '@/lib/billing-shared/types';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

type Props = {
  results: ValidationResult[];
  context?: ValidationGuidanceContext;
  showPassed?: boolean;
};

function MissingDataHoverPanel({ guidance }: { guidance: ValidationGuidance }) {
  const details = guidance.missingDetails ?? [];
  if (details.length === 0) return null;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="group mt-0.5 inline max-w-full rounded-sm text-left text-gray-600 underline decoration-dotted decoration-gray-400 underline-offset-2 hover:text-gray-900 hover:decoration-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40"
        >
          {guidance.description}
          {guidance.hoverHint ? (
            <span className="ml-1.5 text-xs text-gray-400 group-hover:text-gray-500">
              ({guidance.hoverHint})
            </span>
          ) : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        collisionPadding={16}
        className="w-80 p-0"
        sideOffset={6}
      >
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Required values
          </p>
          <p className="mt-0.5 text-sm font-medium text-gray-900">{guidance.title}</p>
        </div>
        <dl className="divide-y divide-gray-100 px-4 py-1">
          {details.map((item) => (
            <div key={item.label} className="py-2.5 text-sm">
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {item.label}
              </dt>
              <dd
                className={
                  item.emphasize
                    ? 'mt-0.5 font-semibold text-gray-900'
                    : 'mt-0.5 font-medium text-gray-800'
                }
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </HoverCardContent>
    </HoverCard>
  );
}

export function ValidationDetailsList({
  results,
  context = {},
  showPassed = true,
}: Props) {
  const visible = showPassed ? results : results.filter((r) => !r.passed);
  const sorted = sortValidationResults(visible);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-gray-500">No validation checks to display.</p>
    );
  }

  return (
    <ul className="space-y-3 text-sm">
      {sorted.map((result) => {
        const guidance = getValidationGuidance(result, context);
        const Icon = result.passed ? CheckCircle2 : XCircle;
        const tone = result.passed ? 'text-[color:var(--billing-accent-strong)]' : 'text-red-700';
        const hasHoverDetails =
          !result.passed && (guidance.missingDetails?.length ?? 0) > 0;

        return (
          <li key={result.rule} className={`flex gap-2 ${tone}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{guidance.title}</p>
              {result.passed && result.message ? (
                <p className="mt-0.5 font-medium text-[color:var(--billing-accent-strong)]">{result.message}</p>
              ) : null}
              {!result.passed ? (
                hasHoverDetails ? (
                  <MissingDataHoverPanel guidance={guidance} />
                ) : (
                  <p className="mt-0.5 text-gray-600">{guidance.description}</p>
                )
              ) : null}
              {!result.passed && guidance.fixHref && guidance.fixLabel ? (
                <p className="mt-1.5">
                  <Link
                    href={guidance.fixHref}
                    scroll={false}
                    className="font-medium text-[color:var(--billing-accent-strong)] underline decoration-[color:var(--billing-accent)]/40 underline-offset-2 hover:text-[color:var(--billing-heading)] hover:decoration-[color:var(--billing-primary)]"
                  >
                    {guidance.fixLabel}
                  </Link>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
