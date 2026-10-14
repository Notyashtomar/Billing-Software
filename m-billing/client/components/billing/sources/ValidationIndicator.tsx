'use client';

import Link from 'next/link';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export function ValidationIndicator({
  passed,
  errorCount,
  progressLabel,
  href,
  onClick,
}: {
  passed: boolean;
  errorCount: number;
  progressLabel?: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = passed ? (
    <span className="inline-flex items-center gap-1 text-[color:var(--billing-accent-strong)]" title="Checklist complete">
      <CheckCircle2 className="h-4 w-4" aria-hidden />
      {progressLabel ? <span className="text-xs">{progressLabel}</span> : null}
      <span className="sr-only">Passed</span>
    </span>
  ) : errorCount > 0 || progressLabel ? (
    <span
      className="inline-flex items-center gap-1 text-red-700"
      title={
        progressLabel
          ? `${progressLabel} checklist items confirmed`
          : `${errorCount} validation error(s)`
      }
    >
      <XCircle className="h-4 w-4" aria-hidden />
      <span className="text-xs">{progressLabel ?? errorCount}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-amber-700" title="Review required">
      <AlertTriangle className="h-4 w-4" aria-hidden />
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        scroll={false}
        className="inline-flex rounded-sm underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex rounded-sm underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {content}
      </button>
    );
  }

  return content;
}

export function MatchIndicator({
  matched,
  label,
  href,
}: {
  matched: boolean;
  label: string;
  href?: string;
}) {
  const content = (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        matched ? 'text-[color:var(--billing-accent-strong)]' : 'text-red-600'
      }`}
      title={matched ? `${label} matched` : `${label} missing — open fix page`}
    >
      {matched ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );

  if (!matched && href) {
    return (
      <Link
        href={href}
        scroll={false}
        className="inline-flex rounded-sm underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {content}
      </Link>
    );
  }

  return content;
}
