'use client';

import { useEffect, useState } from 'react';
import { fetchAdminStations } from '@/lib/admin-stations-api';
import {
  getStoredLoginStationContext,
  resolveStationCompanyBrand,
  resolveStationLogoPath,
  type StationCompanyBrand,
  type StationLogoInput,
} from '@/lib/station-company-logo';

function resolveFromInput(input?: StationLogoInput) {
  return {
    logoPath: resolveStationLogoPath(input),
    brand: resolveStationCompanyBrand(input),
  };
}

function hasLogoInput(input?: StationLogoInput): boolean {
  return Boolean(input?.city?.trim() || input?.stationCode?.trim() || input?.company?.trim());
}

export function useStationCompanyLogo(override?: StationLogoInput): {
  logoPath: string;
  brand: StationCompanyBrand;
} {
  const [resolved, setResolved] = useState(() =>
    resolveFromInput(hasLogoInput(override) ? override : getStoredLoginStationContext()),
  );

  useEffect(() => {
    if (hasLogoInput(override)) {
      setResolved(resolveFromInput(override));
      return;
    }

    const stored = getStoredLoginStationContext();
    if (hasLogoInput(stored)) {
      setResolved(resolveFromInput(stored));
      return;
    }

    const stationId =
      typeof window !== 'undefined' ? localStorage.getItem('userStationId')?.trim() : '';
    if (!stationId) {
      setResolved(resolveFromInput());
      return;
    }

    let cancelled = false;
    void fetchAdminStations()
      .then((rows) => {
        if (cancelled) return;
        const station = rows.find((row) => row.id === stationId);
        if (!station) {
          setResolved(resolveFromInput());
          return;
        }
        const codePrefix = station.code.split('-')[0]?.trim() ?? station.code;
        setResolved(
          resolveFromInput({
            city: station.city,
            stationCode: codePrefix,
            company: station.company,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setResolved(resolveFromInput());
      });

    return () => {
      cancelled = true;
    };
  }, [override?.city, override?.stationCode, override?.company]);

  return resolved;
}
