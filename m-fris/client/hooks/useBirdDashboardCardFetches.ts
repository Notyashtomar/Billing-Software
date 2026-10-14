'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchDashboardAirlineRemarksCard,
  fetchDashboardAircraftAnalysisCard,
  fetchDashboardEquipmentUtilizationCard,
  fetchDashboardPerformanceReportCard,
  fetchDashboardPrimaryCards,
  fetchDashboardPerformanceDrilldown,
  fetchDashboardAirlineRemarksDrilldown,
  fetchDashboardAircraftAnalysisFlights,
  type DashboardEquipmentUtilPayload,
  type DashboardFlightScope,
  type DashboardPerformanceDrilldownPayload,
  type DashboardPerformanceReportSnapshot,
  type DashboardPrimaryCardsResponse,
  type AircraftAnalysisFlightRow,
} from '@/lib/api';
import {
  parseAircraftCategoryMixResponse,
  type AircraftCategoryMixResponse,
} from '@/utils/dashboardAircraftCategory';

export type EquipmentUtilSlotMode = '4h' | '6h';

export type EquipmentDashboardUtilPayload = DashboardEquipmentUtilPayload;

export type AirlineRemarksRatingSummary = {
  from: string;
  to: string;
  total: number;
  blanks: number;
  buckets: { rating: string; count: number }[];
};

export type AirlineRemarksDrillRow = {
  serialNo: number;
  airline: string;
  flightNo: string;
  aircraftType: string;
  ataDate: string;
  ataTime: string;
  airlineRepRem: string;
  airlineRemarksRating: string;
};

type UseBirdDashboardCardFetchesParams = {
  rangeFrom: string;
  rangeTo: string;
  rangeActive: boolean;
  fhrRefreshSeq: number;
  openCard: string | null;
  airlineRemarksDrillRetrySeq: number;
  equipmentUtilSlotMode: EquipmentUtilSlotMode;
  flightScope: DashboardFlightScope;
};

/** Stable hook arity — keeps Fast Refresh from comparing mismatched dependency lengths. */
const CARD_FETCH_EFFECT_GUARD = 1;

/**
 * Independent per-card dashboard fetches. Each effect uses a fixed-size dependency
 * list (primitive range strings + counters) so Fast Refresh never sees a changing
 * hook arity inside the parent dashboard component.
 */
export function useBirdDashboardCardFetches({
  rangeFrom,
  rangeTo,
  rangeActive,
  fhrRefreshSeq,
  openCard,
  airlineRemarksDrillRetrySeq,
  equipmentUtilSlotMode,
  flightScope,
}: UseBirdDashboardCardFetchesParams) {
  const [airlineRatingsSummary, setAirlineRatingsSummary] =
    useState<AirlineRemarksRatingSummary | null>(null);
  const [airlineRatingsLoading, setAirlineRatingsLoading] = useState(false);
  const [airlineRemarksWithTextRows, setAirlineRemarksWithTextRows] = useState<
    AirlineRemarksDrillRow[] | null
  >(null);
  const [airlineRemarksWithTextLoading, setAirlineRemarksWithTextLoading] =
    useState(false);
  const [airlineRemarksDrillError, setAirlineRemarksDrillError] = useState<
    string | null
  >(null);
  const [airlineRemarksDrillMeta, setAirlineRemarksDrillMeta] = useState<{
    ratingsSummary: AirlineRemarksRatingSummary;
    chartTopAirlinesByRating: Record<string, { airline: string; count: number }[]>;
  } | null>(null);

  const [equipmentUtilByMode, setEquipmentUtilByMode] = useState<
    Record<EquipmentUtilSlotMode, EquipmentDashboardUtilPayload | null>
  >({ '4h': null, '6h': null });
  const [equipmentUtilLoadingByMode, setEquipmentUtilLoadingByMode] = useState<
    Record<EquipmentUtilSlotMode, boolean>
  >({ '4h': false, '6h': false });

  const [aircraftCategoryMix, setAircraftCategoryMix] =
    useState<AircraftCategoryMixResponse | null>(null);
  const [aircraftCategoryLoading, setAircraftCategoryLoading] = useState(false);

  const [aircraftAnalysisFlights, setAircraftAnalysisFlights] = useState<
    AircraftAnalysisFlightRow[] | null
  >(null);
  const [aircraftAnalysisFlightsLoading, setAircraftAnalysisFlightsLoading] =
    useState(false);
  const aircraftAnalysisFlightsFetchKeyRef = useRef('');

  const [primaryCards, setPrimaryCards] = useState<DashboardPrimaryCardsResponse | null>(
    null,
  );
  const [primaryCardsLoading, setPrimaryCardsLoading] = useState(false);

  const [performanceReportCard, setPerformanceReportCard] =
    useState<DashboardPerformanceReportSnapshot | null>(null);
  const [performanceReportCardLoading, setPerformanceReportCardLoading] =
    useState(false);

  const [performanceDrilldownPayload, setPerformanceDrilldownPayload] =
    useState<DashboardPerformanceDrilldownPayload | null>(null);
  const [performanceDrilldownLoading, setPerformanceDrilldownLoading] =
    useState(false);
  const performanceDrillFetchKeyRef = useRef('');

  const equipmentUtilSlotsPayload = equipmentUtilByMode[equipmentUtilSlotMode];
  const equipmentUtilSlotsLoading = equipmentUtilLoadingByMode[equipmentUtilSlotMode];

  // Drop previous scope's payloads immediately so UI never shows scheduled numbers under NS.
  useEffect(() => {
    setAirlineRatingsSummary(null);
    setAirlineRemarksWithTextRows(null);
    setAirlineRemarksDrillError(null);
    setAirlineRemarksDrillMeta(null);
    setEquipmentUtilByMode({ '4h': null, '6h': null });
    setAircraftCategoryMix(null);
    setAircraftAnalysisFlights(null);
    aircraftAnalysisFlightsFetchKeyRef.current = '';
    setPrimaryCards(null);
    setPerformanceReportCard(null);
    setPerformanceDrilldownPayload(null);
    performanceDrillFetchKeyRef.current = '';
  }, [flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    if (!rangeActive) {
      setAirlineRatingsSummary(null);
      setAirlineRemarksWithTextRows(null);
      setAirlineRatingsLoading(false);
      setAirlineRemarksDrillError(null);
      setAirlineRemarksDrillMeta(null);
      return;
    }
    setAirlineRatingsLoading(true);
    setAirlineRatingsSummary(null);
    setAirlineRemarksWithTextRows(null);
    setAirlineRemarksDrillError(null);

    void fetchDashboardAirlineRemarksCard(rangeFrom, rangeTo, { signal: ac.signal, flightScope })
      .then((card) => {
        setAirlineRatingsSummary(card.airlineRatings);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setAirlineRatingsSummary(null);
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          const msg = reason instanceof Error ? reason.message : String(reason);
          console.warn('[dash_airline_remarks_card] fetch failed', {
            from: rangeFrom,
            to: rangeTo,
            msg,
          });
        }
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setAirlineRatingsLoading(false);
      });
    return () => ac.abort();
  }, [rangeActive, rangeFrom, rangeTo, fhrRefreshSeq, CARD_FETCH_EFFECT_GUARD, flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    if (!rangeActive) {
      setAircraftCategoryMix(null);
      setAircraftCategoryLoading(false);
      return;
    }
    setAircraftCategoryLoading(true);
    setAircraftCategoryMix(null);

    void fetchDashboardAircraftAnalysisCard(rangeFrom, rangeTo, { signal: ac.signal, flightScope })
      .then((card) => {
        setAircraftCategoryMix(parseAircraftCategoryMixResponse(card.aircraftCategory));
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setAircraftCategoryMix(null);
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          const msg = reason instanceof Error ? reason.message : String(reason);
          console.warn('[dash_aircraft_analysis_card] fetch failed', {
            from: rangeFrom,
            to: rangeTo,
            msg,
          });
        }
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setAircraftCategoryLoading(false);
      });
    return () => ac.abort();
  }, [rangeActive, rangeFrom, rangeTo, fhrRefreshSeq, CARD_FETCH_EFFECT_GUARD, flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    if (!rangeActive) {
      setAircraftAnalysisFlights(null);
      setAircraftAnalysisFlightsLoading(false);
      aircraftAnalysisFlightsFetchKeyRef.current = '';
      return;
    }
    if (openCard !== 'carrierMix') {
      setAircraftAnalysisFlightsLoading(false);
      return;
    }
    const key = `${rangeFrom}|${rangeTo}|${flightScope}|${fhrRefreshSeq}`;
    if (aircraftAnalysisFlightsFetchKeyRef.current === key) {
      return;
    }
    setAircraftAnalysisFlights(null);
    setAircraftAnalysisFlightsLoading(true);

    void fetchDashboardAircraftAnalysisFlights(rangeFrom, rangeTo, {
      signal: ac.signal,
      flightScope,
    })
      .then((payload) => {
        if (ac.signal.aborted) return;
        aircraftAnalysisFlightsFetchKeyRef.current = key;
        setAircraftAnalysisFlights(payload.flights ?? []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        aircraftAnalysisFlightsFetchKeyRef.current = '';
        setAircraftAnalysisFlights([]);
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          const msg = reason instanceof Error ? reason.message : String(reason);
          console.warn('[dash_aircraft_analysis_flights] fetch failed', {
            from: rangeFrom,
            to: rangeTo,
            msg,
          });
        }
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setAircraftAnalysisFlightsLoading(false);
      });
    return () => ac.abort();
  }, [rangeActive, rangeFrom, rangeTo, openCard, fhrRefreshSeq, CARD_FETCH_EFFECT_GUARD, flightScope]);

  useEffect(() => {
    const ac4h = new AbortController();
    const ac6h = new AbortController();
    if (!rangeActive) {
      setEquipmentUtilByMode({ '4h': null, '6h': null });
      setEquipmentUtilLoadingByMode({ '4h': false, '6h': false });
      return;
    }
    setEquipmentUtilLoadingByMode({ '4h': true, '6h': true });
    setEquipmentUtilByMode({ '4h': null, '6h': null });

    const loadMode = (mode: EquipmentUtilSlotMode, signal: AbortSignal) =>
      fetchDashboardEquipmentUtilizationCard(rangeFrom, rangeTo, mode, {
        signal,
        flightScope,
      })
        .then((card) => {
          if (signal.aborted) return;
          setEquipmentUtilByMode((prev) => ({ ...prev, [mode]: card.equipmentUtil }));
        })
        .catch((reason) => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return;
          if (signal.aborted) return;
          setEquipmentUtilByMode((prev) => ({ ...prev, [mode]: null }));
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            const msg = reason instanceof Error ? reason.message : String(reason);
            console.warn('[dash_equipment_util_card] fetch failed', {
              from: rangeFrom,
              to: rangeTo,
              mode,
              msg,
            });
          }
        })
        .finally(() => {
          if (signal.aborted) return;
          setEquipmentUtilLoadingByMode((prev) => ({ ...prev, [mode]: false }));
        });

    void loadMode('4h', ac4h.signal);
    void loadMode('6h', ac6h.signal);

    return () => {
      ac4h.abort();
      ac6h.abort();
    };
  }, [rangeActive, rangeFrom, rangeTo, fhrRefreshSeq, CARD_FETCH_EFFECT_GUARD, flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    if (!rangeActive) {
      setPerformanceReportCard(null);
      setPerformanceReportCardLoading(false);
      return;
    }
    setPerformanceReportCardLoading(true);
    setPerformanceReportCard(null);

    void fetchDashboardPerformanceReportCard(rangeFrom, rangeTo, { signal: ac.signal, flightScope })
      .then((card) => {
        setPerformanceReportCard(card.performanceReport);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setPerformanceReportCard(null);
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          const msg = reason instanceof Error ? reason.message : String(reason);
          console.warn('[dash_performance_report_card] fetch failed', {
            from: rangeFrom,
            to: rangeTo,
            msg,
          });
        }
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setPerformanceReportCardLoading(false);
      });
    return () => ac.abort();
  }, [rangeActive, rangeFrom, rangeTo, fhrRefreshSeq, CARD_FETCH_EFFECT_GUARD, flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    if (!rangeActive) {
      setPrimaryCards(null);
      setPrimaryCardsLoading(false);
      setPerformanceDrilldownPayload(null);
      performanceDrillFetchKeyRef.current = '';
      return;
    }
    setPrimaryCardsLoading(true);
    setPrimaryCards(null);
    setPerformanceDrilldownPayload(null);
    performanceDrillFetchKeyRef.current = '';

    void fetchDashboardPrimaryCards(rangeFrom, rangeTo, '4h', { signal: ac.signal, flightScope })
      .then((bundle) => setPrimaryCards(bundle))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setPrimaryCards(null);
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          const msg = reason instanceof Error ? reason.message : String(reason);
          console.warn('[dash_primary] bundle fetch failed', {
            from: rangeFrom,
            to: rangeTo,
            msg,
          });
        }
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setPrimaryCardsLoading(false);
      });
    return () => ac.abort();
  }, [rangeActive, rangeFrom, rangeTo, fhrRefreshSeq, CARD_FETCH_EFFECT_GUARD, flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    if (!rangeActive) {
      setPerformanceDrilldownPayload(null);
      setPerformanceDrilldownLoading(false);
      performanceDrillFetchKeyRef.current = '';
      return;
    }
    const needsDrill =
      openCard === 'performanceReportDrill' ||
      openCard === 'onTimeFlights' ||
      openCard === 'ghaImprovement';
    if (!needsDrill) {
      setPerformanceDrilldownLoading(false);
      return;
    }
    const key = `${rangeFrom}|${rangeTo}|${flightScope}|${fhrRefreshSeq}`;
    if (performanceDrillFetchKeyRef.current === key) {
      return;
    }

    setPerformanceDrilldownPayload(null);
    setPerformanceDrilldownLoading(true);
    void fetchDashboardPerformanceDrilldown(rangeFrom, rangeTo, '4h', {
      signal: ac.signal,
      flightScope,
    })
      .then((payload) => {
        if (ac.signal.aborted) return;
        performanceDrillFetchKeyRef.current = key;
        setPerformanceDrilldownPayload(payload.performanceReport ?? null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        performanceDrillFetchKeyRef.current = '';
        setPerformanceDrilldownPayload(null);
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          const msg = reason instanceof Error ? reason.message : String(reason);
          console.warn('[dash_perf_drill] fetch failed', {
            from: rangeFrom,
            to: rangeTo,
            msg,
          });
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setPerformanceDrilldownLoading(false);
        }
      });
    return () => {
      ac.abort();
      setPerformanceDrilldownLoading(false);
    };
  }, [rangeActive, rangeFrom, rangeTo, openCard, fhrRefreshSeq, CARD_FETCH_EFFECT_GUARD, flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    if (openCard !== 'airlineRemarks' || !rangeActive) {
      return;
    }
    setAirlineRemarksWithTextLoading(true);
    setAirlineRemarksDrillError(null);
    setAirlineRemarksDrillMeta(null);
    setAirlineRemarksWithTextRows(null);
    void fetchDashboardAirlineRemarksDrilldown(rangeFrom, rangeTo, '4h', {
      signal: ac.signal,
      flightScope,
    })
      .then((payload) => {
        setAirlineRemarksDrillError(null);
        const normalized = (payload.rows ?? []).map((r) => ({
          serialNo: r.serialNo,
          airline: r.airline,
          flightNo: r.flightNo,
          aircraftType: '',
          ataDate: r.ataDate,
          ataTime: r.ataTime,
          airlineRepRem: r.remarkPreview ?? '',
          airlineRemarksRating: r.airlineRemarksRating,
        }));
        setAirlineRemarksWithTextRows(normalized);
        setAirlineRemarksDrillMeta({
          ratingsSummary: payload.ratingsSummary,
          chartTopAirlinesByRating: payload.chartTopAirlinesByRating ?? {},
        });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setAirlineRemarksDrillError('retry');
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          const msg = reason instanceof Error ? reason.message : String(reason);
          console.warn('[dash_airline_drill] fetch failed', {
            from: rangeFrom,
            to: rangeTo,
            msg,
          });
        }
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setAirlineRemarksWithTextLoading(false);
      });
    return () => ac.abort();
  }, [
    rangeActive,
    rangeFrom,
    rangeTo,
    openCard,
    fhrRefreshSeq,
    airlineRemarksDrillRetrySeq,
    CARD_FETCH_EFFECT_GUARD,
    flightScope,
  ]);

  return useMemo(
    () => ({
      airlineRatingsSummary,
      airlineRatingsLoading,
      airlineRemarksWithTextRows,
      airlineRemarksWithTextLoading,
      airlineRemarksDrillError,
      airlineRemarksDrillMeta,
      equipmentUtilSlotsPayload,
      equipmentUtilSlotsLoading,
      equipmentUtilByMode,
      equipmentUtilLoadingByMode,
      aircraftCategoryMix,
      aircraftCategoryLoading,
      aircraftAnalysisFlights,
      aircraftAnalysisFlightsLoading,
      primaryCards,
      primaryCardsLoading,
      performanceReportCard,
      performanceReportCardLoading,
      performanceDrilldownPayload,
      performanceDrilldownLoading,
    }),
    [
      airlineRatingsSummary,
      airlineRatingsLoading,
      airlineRemarksWithTextRows,
      airlineRemarksWithTextLoading,
      airlineRemarksDrillError,
      airlineRemarksDrillMeta,
      equipmentUtilSlotsPayload,
      equipmentUtilSlotsLoading,
      equipmentUtilByMode,
      equipmentUtilLoadingByMode,
      aircraftCategoryMix,
      aircraftCategoryLoading,
      aircraftAnalysisFlights,
      aircraftAnalysisFlightsLoading,
      primaryCards,
      primaryCardsLoading,
      performanceReportCard,
      performanceReportCardLoading,
      performanceDrilldownPayload,
      performanceDrilldownLoading,
    ],
  );
}
