'use client';

import { useMemo } from 'react';
import ScheduledEquipmentManpowerForm from '../scheduledairlines/EquipmentManpowerForm';
import type { BaseFormProps } from './types';
import { adaptNonScheduledFlight } from './adaptNonScheduledFlight';

type EquipmentManpowerFormProps = BaseFormProps & {
  /** After GSD verify / equipment save — refresh Ramp/Pax/GSD lock icons. */
  onGsdLockStateSaved?: (serial: string) => void;
};

export default function EquipmentManpowerForm({
  flight,
  onGsdLockStateSaved,
}: EquipmentManpowerFormProps) {
  const adaptedFlight = useMemo(
    () => (flight ? adaptNonScheduledFlight(flight) : null),
    [flight],
  );

  if (!adaptedFlight) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-6">
        <p className="text-sm text-gray-500" role="status">
          Select a flight to manage equipment and manpower.
        </p>
      </div>
    );
  }

  return (
    <ScheduledEquipmentManpowerForm
      flight={adaptedFlight}
      useAllEquipmentInventory
      onGsdLockStateSaved={onGsdLockStateSaved}
    />
  );
}
