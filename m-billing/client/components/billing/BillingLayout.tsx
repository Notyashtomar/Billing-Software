'use client';

import type { ReactNode } from 'react';
import { billingUi } from './billingUi';

type BillingLayoutProps = {
  children: ReactNode;
};

/**
 * BC: Sales module shell
 * FRIS: /billing/*
 * Nav lives in the shared FRIS top navbar (billing chrome tabs).
 */
export function BillingLayout({ children }: BillingLayoutProps) {
  return (
    <div className="flex w-full min-w-0 flex-col bg-[color:var(--billing-bg)]">
      <main className="billing-page-main flex w-full min-w-0 flex-col overflow-x-hidden p-3 sm:p-6">
        <div className="billing-page-content flex w-full min-w-0 max-w-full flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}

export function BillingPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:mb-6 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className={billingUi.pageTitle}>{title}</h1>
        {description ? <p className={billingUi.pageSubtitle}>{description}</p> : null}
      </div>
      {actions ? (
        <div className={`${billingUi.pageHeaderActions} md:flex-1 md:justify-end`}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
