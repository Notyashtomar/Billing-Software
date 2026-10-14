'use client';

import Link from 'next/link';
import { ArrowRight, Package, Plane, Shield } from 'lucide-react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';

type MisSourceCard = {
  id: 'bhs' | 'ads' | 'raf';
  title: string;
  subtitle: string;
  href: string;
  icon: typeof Package;
  accent: string;
};

const CARDS: readonly MisSourceCard[] = [
  {
    id: 'bhs',
    title: 'BHS',
    subtitle: 'Regular Basic Handling Services — airline × rate bill check analysis',
    href: '/billing/mis-checker/bhs',
    icon: Package,
    accent: 'from-sky-50 to-blue-50/60 border-sky-200/80',
  },
  {
    id: 'ads',
    title: 'ADS',
    subtitle: 'Additional / equipment services — bill check analysis',
    href: '/billing/mis-checker/ads',
    icon: Plane,
    accent: 'from-violet-50 to-indigo-50/50 border-violet-200/80',
  },
  {
    id: 'raf',
    title: 'RAF',
    subtitle: 'Ramp Assistance Forms — bill check analysis',
    href: '/billing/mis-checker/raf',
    icon: Shield,
    accent: 'from-emerald-50 to-teal-50/50 border-emerald-200/80',
  },
];

/**
 * MIS Checker hub — pick BHS / ADS / RAF before opening bill-check analysis.
 */
export function MisCheckerHubPage() {
  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title="MIS Checker"
        description="Choose a billed-service source to open bill check analysis"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card, index) => {
          const Icon = card.icon;
          const enterDelay =
            index === 0
              ? 'billing-tile-enter-delay-1'
              : index === 1
                ? 'billing-tile-enter-delay-2'
                : 'billing-tile-enter-delay-3';
          return (
            <Link
              key={card.id}
              href={card.href}
              className={`${billingUi.card} ${billingUi.tileGlow} billing-tile-enter ${enterDelay} group relative flex min-h-[11rem] flex-col bg-gradient-to-br ${card.accent} p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)]`}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--billing-radius-lg)] border border-slate-200/80 bg-white text-slate-700 shadow-[var(--billing-shadow-sm)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <ArrowRight
                  className="h-4 w-4 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-slate-700"
                  aria-hidden
                />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {card.title}
              </h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">
                {card.subtitle}
              </p>
              <span className="mt-4 text-sm font-semibold text-slate-800">
                Open analysis
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
