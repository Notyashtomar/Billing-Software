'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchDashboardAirlineRemarksCard,
  fetchDashboardAircraftAnalysisCard,
  fetchDashboardAirlineRemarksDrilldown,
  fetchDashboardEquipmentUtilizationCard,
  fetchDashboardPerformanceDrilldown,
  fetchDashboardPrimaryCards,
  type DashboardAirlineRemarksCardResponse,
  type DashboardAircraftAnalysisCardResponse,
  type DashboardAirlineRemarksDrilldownResponse,
  type DashboardEquipmentUtilizationCardResponse,
  type DashboardPerformanceDrilldownPayload,
  type DashboardPrimaryCardsResponse,
  type DashboardSecondaryCardsResponse,
} from '@/lib/api';
import { dashboardBundleMatchesRequestedRange } from '@/utils/dashboardBundleStaleGuard';
import { readFrisQueryStationCode } from '@/hooks/fris/fris-query-keys';

function dashboardCardQueryKey(
  cardType: string,
  range: { from: string; to: string } | null,
  extra: readonly unknown[] = [],
) {
  const from = range?.from ?? '';
  const to = range?.to ?? '';
  return ['dashboard-card', readFrisQueryStationCode(), cardType, from, to, ...extra] as const;
}

export function useBirdDashboardAirlineRemarksQuery(
  range: { from: string; to: string } | null,
  fhrRefreshSeq: number,
) {
  return useQuery<DashboardAirlineRemarksCardResponse, Error>({
    queryKey: dashboardCardQueryKey('airline-remarks', range, [fhrRefreshSeq]),
    enabled: range != null,
    queryFn: async ({ signal }) => {
      const { from, to } = range!;
      const card = await fetchDashboardAirlineRemarksCard(from, to, { signal });
      if (!dashboardBundleMatchesRequestedRange(card, from, to)) {
        throw new Error('Stale airline remarks card response');
      }
      return card;
    },
  });
}

export function useBirdDashboardAircraftAnalysisQuery(
  range: { from: string; to: string } | null,
  fhrRefreshSeq: number,
) {
  return useQuery<DashboardAircraftAnalysisCardResponse, Error>({
    queryKey: dashboardCardQueryKey('aircraft-analysis', range, [fhrRefreshSeq]),
    enabled: range != null,
    queryFn: async ({ signal }) => {
      const { from, to } = range!;
      const card = await fetchDashboardAircraftAnalysisCard(from, to, { signal });
      if (!dashboardBundleMatchesRequestedRange(card, from, to)) {
        throw new Error('Stale aircraft analysis card response');
      }
      return card;
    },
  });
}

export function useBirdDashboardEquipmentUtilQuery(
  range: { from: string; to: string } | null,
  equipmentMode: '4h' | '6h',
  fhrRefreshSeq: number,
) {
  return useQuery<DashboardEquipmentUtilizationCardResponse, Error>({
    queryKey: dashboardCardQueryKey('equipment-util', range, [
      equipmentMode,
      fhrRefreshSeq,
    ]),
    enabled: range != null,
    queryFn: async ({ signal }) => {
      const { from, to } = range!;
      const card = await fetchDashboardEquipmentUtilizationCard(from, to, equipmentMode, {
        signal,
      });
      if (
        !dashboardBundleMatchesRequestedRange(card, from, to) ||
        card.equipmentMode !== equipmentMode
      ) {
        throw new Error('Stale equipment utilization card response');
      }
      return card;
    },
  });
}

/** Legacy bundle — fetches airline, aircraft, and equipment cards in parallel (no cross-card coupling). */
export function useBirdDashboardSecondaryQuery(
  range: { from: string; to: string } | null,
  equipmentMode: '4h' | '6h',
  fhrRefreshSeq: number,
) {
  return useQuery<DashboardSecondaryCardsResponse, Error>({
    queryKey: dashboardCardQueryKey('secondary', range, [
      equipmentMode,
      fhrRefreshSeq,
    ]),
    enabled: range != null,
    queryFn: async ({ signal }) => {
      const { from, to } = range!;
      const [airline, aircraft, equipment] = await Promise.all([
        fetchDashboardAirlineRemarksCard(from, to, { signal }),
        fetchDashboardAircraftAnalysisCard(from, to, { signal }),
        fetchDashboardEquipmentUtilizationCard(from, to, equipmentMode, { signal }),
      ]);
      const bundle: DashboardSecondaryCardsResponse = {
        from,
        to,
        equipmentMode,
        airlineRatings: airline.airlineRatings,
        aircraftCategory: aircraft.aircraftCategory,
        equipmentUtil: equipment.equipmentUtil,
        _perf: equipment._perf ?? airline._perf ?? aircraft._perf,
      };
      if (!dashboardBundleMatchesRequestedRange(bundle, from, to)) {
        throw new Error('Stale secondary dashboard response');
      }
      return bundle;
    },
  });
}

export function useBirdDashboardPrimaryQuery(
  range: { from: string; to: string } | null,
  fhrRefreshSeq: number,
) {
  return useQuery<DashboardPrimaryCardsResponse, Error>({
    queryKey: dashboardCardQueryKey('primary', range, [fhrRefreshSeq]),
    enabled: range != null,
    queryFn: async ({ signal }) => {
      const { from, to } = range!;
      const bundle = await fetchDashboardPrimaryCards(from, to, '4h', {
        signal,
      });
      if (!dashboardBundleMatchesRequestedRange(bundle, from, to)) {
        throw new Error('Stale primary dashboard response');
      }
      return bundle;
    },
  });
}

export function useBirdDashboardPerformanceDrillQuery(
  range: { from: string; to: string } | null,
  fhrRefreshSeq: number,
  needsDrill: boolean,
) {
  return useQuery<DashboardPerformanceDrilldownPayload | null, Error>({
    queryKey: dashboardCardQueryKey('drill-performance', range, [fhrRefreshSeq]),
    enabled: range != null && needsDrill,
    queryFn: async ({ signal }) => {
      const { from, to } = range!;
      const res = await fetchDashboardPerformanceDrilldown(from, to, '4h', {
        signal,
      });
      return res.performanceReport ?? null;
    },
  });
}

export function useBirdDashboardAirlineRemarksDrillQuery(
  range: { from: string; to: string } | null,
  fhrRefreshSeq: number,
  retrySeq: number,
  enabled: boolean,
) {
  return useQuery<DashboardAirlineRemarksDrilldownResponse, Error>({
    queryKey: dashboardCardQueryKey('drill-airline', range, [
      fhrRefreshSeq,
      retrySeq,
    ]),
    enabled: range != null && enabled,
    queryFn: async ({ signal }) => {
      const { from, to } = range!;
      const payload = await fetchDashboardAirlineRemarksDrilldown(from, to, '4h', {
        signal,
      });
      if (!dashboardBundleMatchesRequestedRange(payload, from, to)) {
        throw new Error('Stale airline remarks drilldown response');
      }
      return payload;
    },
  });
}
