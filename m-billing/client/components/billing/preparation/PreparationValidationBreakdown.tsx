'use client';

import Link from 'next/link';
import { useMemo, type ReactElement } from 'react';
import { CheckCircle2, ChevronRight, XCircle } from 'lucide-react';
import {
  getValidationGuidance,
  sortValidationResults,
  type ValidationGuidance,
  type ValidationGuidanceContext,
} from '@/lib/billing-shared/preparation-validation-guidance';
import type { ValidationResult } from '@/lib/billing-shared/types';
import { Checkbox } from '@/components/ui/checkbox';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

type ChecklistItemProps = {
  result: ValidationResult;
  context: ValidationGuidanceContext;
  recordId: string;
  confirmed: boolean;
  overridden: boolean;
  readOnly: boolean;
  saving: boolean;
  onToggle: (rule: string, checked: boolean) => void;
};

function GuidanceHoverDetails({
  guidance,
  fixHref,
  trigger,
}: {
  guidance: ValidationGuidance;
  fixHref?: string;
  trigger: ReactElement;
}) {
  const details = guidance.missingDetails ?? [];
  const showDescription = Boolean(guidance.description?.trim());

  if (!showDescription && details.length === 0 && !fixHref) {
    return trigger;
  }

  return (
    <HoverCard openDelay={100} closeDelay={60}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        collisionPadding={12}
        className="w-72 p-0"
        sideOffset={4}
      >
        <div className="border-b border-gray-100 px-3 py-2">
          <p className="text-xs font-semibold text-gray-900">{guidance.title}</p>
        </div>
        <div className="space-y-2 px-3 py-2">
          {showDescription ? (
            <p className="text-xs leading-relaxed text-gray-600">{guidance.description}</p>
          ) : null}
          {details.length > 0 ? (
            <dl className="space-y-1.5">
              {details.map((item) => (
                <div key={item.label} className="text-xs">
                  <dt className="font-medium uppercase tracking-wide text-gray-500">
                    {item.label}
                  </dt>
                  <dd
                    className={
                      item.emphasize
                        ? 'font-semibold text-gray-900'
                        : 'font-medium text-gray-800'
                    }
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {fixHref ? (
            <Link
              href={fixHref}
              scroll={false}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-[color:var(--billing-accent-strong)] underline decoration-[color:var(--billing-accent)]/40 underline-offset-2 hover:text-[color:var(--billing-heading)]"
            >
              {guidance.fixLabel ?? 'Open fix page'}
              <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function FailedValidationItem({
  result,
  context,
  recordId,
  confirmed,
  overridden,
  readOnly,
  saving,
  onToggle,
}: ChecklistItemProps) {
  const guidance = getValidationGuidance(result, context);
  const fixHref = !confirmed && !result.passed ? guidance.fixHref : undefined;

  const titleTrigger = fixHref ? (
    <Link
      href={fixHref}
      scroll={false}
      className="block min-w-0 truncate text-sm font-medium leading-snug text-gray-900 underline decoration-dotted underline-offset-2 hover:text-[color:var(--billing-accent-strong)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--billing-accent)]/40"
      title={guidance.title}
    >
      {guidance.title}
    </Link>
  ) : (
    <label
      htmlFor={`check-${recordId}-${result.rule}`}
      className="block min-w-0 cursor-pointer truncate text-sm font-medium leading-snug text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--billing-accent)]/40"
      title={guidance.title}
    >
      {guidance.title}
    </label>
  );

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 rounded border px-2 py-1 ${
        confirmed
          ? 'border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)]/50'
          : 'border-red-200 bg-red-50/40'
      }`}
    >
      <Checkbox
        id={`check-${recordId}-${result.rule}`}
        checked={confirmed}
        disabled={readOnly || saving}
        onCheckedChange={(value) => onToggle(result.rule, value === true)}
        className="shrink-0"
        aria-label={`Confirm ${guidance.title}`}
      />
      <div className="min-w-0 flex-1">
        <GuidanceHoverDetails
          guidance={guidance}
          fixHref={fixHref}
          trigger={titleTrigger}
        />
      </div>
      {overridden ? (
        <span
          className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
          title="Manual override"
        >
          Manual
        </span>
      ) : null}
      {!result.passed ? (
        <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--billing-accent)]" aria-hidden />
      )}
    </div>
  );
}

function PassedValidationItem({
  result,
  context,
  recordId,
  confirmed,
  overridden,
  readOnly,
  saving,
  onToggle,
}: ChecklistItemProps) {
  const guidance = getValidationGuidance(result, context);

  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)]/30 px-2 py-1">
      <Checkbox
        id={`check-${recordId}-${result.rule}`}
        checked={confirmed}
        disabled={readOnly || saving}
        onCheckedChange={(value) => onToggle(result.rule, value === true)}
        className="shrink-0"
        aria-label={`Confirm ${guidance.title}`}
      />
      <label
        htmlFor={`check-${recordId}-${result.rule}`}
        className="min-w-0 flex-1 cursor-pointer truncate text-xs font-medium leading-snug text-gray-800"
        title={guidance.title}
      >
        {guidance.title}
      </label>
      {overridden ? (
        <span
          className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800"
          title="Manual override"
        >
          Manual
        </span>
      ) : null}
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--billing-accent)]" aria-hidden />
    </div>
  );
}

type Props = {
  results: ValidationResult[];
  context?: ValidationGuidanceContext;
  recordId: string;
  readOnly: boolean;
  saving: boolean;
  getConfirmed: (rule: string) => boolean;
  isOverridden: (rule: string) => boolean;
  onToggle: (rule: string, checked: boolean) => void;
};

export function PreparationValidationBreakdown({
  results,
  context = {},
  recordId,
  readOnly,
  saving,
  getConfirmed,
  isOverridden,
  onToggle,
}: Props) {
  const sorted = useMemo(() => sortValidationResults(results), [results]);

  const failed = sorted.filter((result) => !getConfirmed(result.rule) || !result.passed);
  const passed = sorted.filter((result) => getConfirmed(result.rule) && result.passed);

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-500">No validation checks to display.</p>;
  }

  const itemProps = (result: ValidationResult): ChecklistItemProps => ({
    result,
    context,
    recordId,
    confirmed: getConfirmed(result.rule),
    overridden: isOverridden(result.rule),
    readOnly,
    saving,
    onToggle,
  });

  return (
    <div className="space-y-2">
      {failed.length > 0 ? (
        <section>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700">
              Failed / needs review
            </h4>
            <span className="text-xs text-red-600">{failed.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {failed.map((result) => (
              <FailedValidationItem key={result.rule} {...itemProps(result)} />
            ))}
          </div>
        </section>
      ) : null}

      {passed.length > 0 ? (
        <section>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
              Passed
            </h4>
            <span className="text-xs text-[color:var(--billing-accent)]">{passed.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {passed.map((result) => (
              <PassedValidationItem key={result.rule} {...itemProps(result)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
