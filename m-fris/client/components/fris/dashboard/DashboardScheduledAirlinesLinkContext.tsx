'use client';

import { createContext, useContext } from 'react';
import type { DashboardScheduledReturnContext } from '@/lib/dashboardScheduledAirlinesNav';

export const DashboardScheduledAirlinesLinkContext =
  createContext<DashboardScheduledReturnContext | null>(null);

export function useDashboardScheduledAirlinesLinkContext(): DashboardScheduledReturnContext | null {
  return useContext(DashboardScheduledAirlinesLinkContext);
}

/** When true, dashboard drill modals open without flip/zoom entrance animations (return from Scheduled Airlines). */
export const DashboardModalInstantOpenContext = createContext(false);

export function useDashboardModalInstantOpen(): boolean {
  return useContext(DashboardModalInstantOpenContext);
}
