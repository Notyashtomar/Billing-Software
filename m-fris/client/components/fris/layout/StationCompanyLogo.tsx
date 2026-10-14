'use client';

import type { ImgHTMLAttributes } from 'react';
import { useStationCompanyLogo } from '@/hooks/useStationCompanyLogo';
import type { StationLogoInput } from '@/lib/station-company-logo';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  alt?: string;
  station?: StationLogoInput;
  onError?: ImgHTMLAttributes<HTMLImageElement>['onError'];
};

export function StationCompanyLogo({ className, alt, station, onError }: Props) {
  const { logoPath, brand } = useStationCompanyLogo(station);

  return (
    <img
      src={logoPath}
      alt={alt ?? `${brand} logo`}
      className={cn('object-contain', className)}
      onError={onError}
    />
  );
}
