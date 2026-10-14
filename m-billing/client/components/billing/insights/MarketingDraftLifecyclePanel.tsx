'use client';

import Link from 'next/link';
import { billingUi } from '../billingUi';
import { formatInr } from './insightsMock';
import type { MarketingDraftLifecycle } from './insightsMock';

const STAGE_ORDER = ['creation', 'approval', 'collection'] as const;

type Props = {
  drafts: MarketingDraftLifecycle[];
};

/**
 * Per-draft lifecycle: Creation → Approval → Collection.
 * Horizontal stepper UI for Marketing Insights.
 */
export function MarketingDraftLifecyclePanel({ drafts }: Props) {
  return (
    <section
      className={`${billingUi.insightsCard} billing-tile-enter billing-tile-enter-delay-2 p-4 sm:p-5`}
      aria-label="Draft lifecycle — creation to collection"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="m-0 text-base font-semibold text-[color:var(--billing-heading)] sm:text-lg">
            Draft lifecycle
          </h2>
          <p className="m-0 mt-0.5 text-xs text-[color:var(--billing-text-muted)] sm:text-sm">
            Creation → Approval → Collection — time at each stage
          </p>
        </div>
        <Link
          href="/billing/invoice-drafts"
          scroll={false}
          className={`${billingUi.link} text-sm`}
        >
          Open drafts
        </Link>
      </div>

      <div className="space-y-3">
        {drafts.map((draft, idx) => (
          <article
            key={draft.id}
            className={`billing-tile-glow billing-tile-enter billing-tile-enter-delay-${(idx % 4) + 1} rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)] p-3.5 sm:p-4`}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="m-0 truncate text-sm font-semibold text-[color:var(--billing-heading)] sm:text-base">
                  {draft.title}
                </h3>
                <p className="m-0 mt-0.5 text-xs text-[color:var(--billing-text-muted)]">
                  {draft.customer} · {draft.ref}
                </p>
              </div>
              <div className="text-right">
                <p className="m-0 text-lg font-bold tabular-nums text-[color:var(--billing-heading)] sm:text-xl">
                  {formatInr(draft.amount)}
                </p>
                <p className="m-0 text-[11px] font-medium uppercase tracking-wide text-[color:var(--billing-text-muted)]">
                  {draft.currentLabel}
                </p>
              </div>
            </div>

            <ol className="m-0 flex list-none flex-col gap-3 p-0 sm:flex-row sm:items-stretch sm:gap-0">
              {STAGE_ORDER.map((key, stageIdx) => {
                const stage = draft.stages.find((s) => s.key === key);
                if (!stage) return null;
                const done = stage.status === 'done';
                const current = stage.status === 'current';
                const pending = stage.status === 'pending';
                return (
                  <li
                    key={key}
                    className="relative flex flex-1 flex-col sm:px-1"
                  >
                    {stageIdx < STAGE_ORDER.length - 1 ? (
                      <span
                        className="pointer-events-none absolute left-[11px] top-5 hidden h-[2px] w-[calc(100%-8px)] translate-x-3 sm:block"
                        style={{
                          background: done
                            ? 'var(--billing-info)'
                            : 'color-mix(in srgb, var(--billing-border-strong) 70%, transparent)',
                        }}
                        aria-hidden
                      />
                    ) : null}
                    <div className="flex items-start gap-2.5 sm:flex-col sm:items-start sm:gap-2">
                      <span
                        className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          done
                            ? 'bg-[color:var(--billing-info)] text-white'
                            : current
                              ? 'bg-[color:var(--billing-accent)] text-[color:var(--billing-accent-strong)] ring-2 ring-[color:var(--billing-info)]'
                              : 'bg-[color:var(--billing-surface)] text-[color:var(--billing-text-muted)] border border-[color:var(--billing-border-strong)]'
                        }`}
                        aria-hidden
                      >
                        {done ? '✓' : stageIdx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`m-0 text-xs font-semibold uppercase tracking-wide sm:text-[11px] ${
                            pending
                              ? 'text-[color:var(--billing-text-muted)]'
                              : 'text-[color:var(--billing-heading)]'
                          }`}
                        >
                          {stage.label}
                        </p>
                        <p className="m-0 mt-0.5 text-sm font-semibold tabular-nums text-[color:var(--billing-text)] sm:text-base">
                          {stage.at}
                        </p>
                        {stage.duration ? (
                          <p className="m-0 mt-0.5 text-[11px] text-[color:var(--billing-text-muted)]">
                            {stage.duration}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
