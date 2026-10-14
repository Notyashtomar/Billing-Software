'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAdvanceScheduleSetupAirlines } from '@/lib/api';
import { frisQueryKeys, readFrisQueryStationCode } from '@/hooks/fris/fris-query-keys';

export type AdvanceScheduleAirlineOption = {
  id: string;
  name: string;
  code: string;
};

export function useAdvanceScheduleAirlinesQuery(enabled = true) {
  return useQuery<AdvanceScheduleAirlineOption[], Error>({
    queryKey: frisQueryKeys.advanceScheduleAirlines(readFrisQueryStationCode()),
    enabled,
    queryFn: () => fetchAdvanceScheduleSetupAirlines(),
  });
}
