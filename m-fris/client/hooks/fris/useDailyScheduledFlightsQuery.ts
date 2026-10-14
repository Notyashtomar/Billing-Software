'use client';

import {
  queryOptions,
  useQuery,
  type QueryFunctionContext,
} from '@tanstack/react-query';
import { fetchDailyScheduledFromAdvance } from '@/lib/api';
import { frisQueryKeys, readFrisQueryStationCode } from '@/hooks/fris/fris-query-keys';

export function dailyScheduledFlightsQueryOptions(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  options?: { bustCache?: boolean },
) {
  const from = fromDdMmYyyy.trim();
  const to = toDdMmYyyy.trim();

  return queryOptions({
    queryKey: frisQueryKeys.dailyScheduledFlights(readFrisQueryStationCode(), from, to),
    queryFn: ({ signal }: QueryFunctionContext) =>
      fetchDailyScheduledFromAdvance(from, to, {
        bustCache: options?.bustCache,
        signal,
      }),
    enabled: from.length > 0 && to.length > 0,
  });
}

export function useDailyScheduledFlightsQuery(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  enabled = true,
  options?: { bustCache?: boolean },
) {
  const queryOpts = dailyScheduledFlightsQueryOptions(fromDdMmYyyy, toDdMmYyyy, options);
  return useQuery({
    ...queryOpts,
    enabled: enabled && queryOpts.enabled,
  });
}
