/**
 * Chennai (MAA) station equipment master list.
 *
 * Recovered from the dashboard aggregate backup captured before the master
 * catalog disappeared. Categories follow the dashboard buckets:
 * M = motorised, NM = non-motorised, T = towable.
 */
export const MAA_EQUIPMENT_SEED = [
  { equipmentName: 'Ambulift', equipmentCode: 'AMB', category: 'M', active: true },
  { equipmentName: 'Diesel Tractor', equipmentCode: 'DT', category: 'M', active: true },
  { equipmentName: 'Electric Baggage Tractor', equipmentCode: 'EBT', category: 'M', active: true },
  { equipmentName: 'Lower Deck Loader', equipmentCode: 'LDL', category: 'M', active: true },
  { equipmentName: 'Main Deck Loader', equipmentCode: 'MDL', category: 'M', active: true },
  { equipmentName: 'Passenger Coach', equipmentCode: 'PAXCOACH', category: 'M', active: true },
  { equipmentName: 'Push Back-Narrow Body', equipmentCode: 'PBNB', category: 'M', active: true },
  { equipmentName: 'Ramp Car', equipmentCode: 'RC', category: 'M', active: true },
  { equipmentName: 'Toilet service', equipmentCode: 'TS', category: 'M', active: true },
  { equipmentName: 'Chokes', equipmentCode: 'CK', category: 'NM', active: true },
  { equipmentName: 'Cones', equipmentCode: 'C', category: 'NM', active: true },
  { equipmentName: 'Air Conditioner Unit', equipmentCode: 'ACU', category: 'T', active: true },
  { equipmentName: 'Baggage Trolly', equipmentCode: 'BT', category: 'T', active: true },
  {
    equipmentName: 'Pax Step Ladder (remote bay) Towable',
    equipmentCode: 'PSL-TOWABLE',
    category: 'T',
    active: true,
  },
  { equipmentName: 'Towbar', equipmentCode: 'TOW', category: 'T', active: true },
  { equipmentName: 'Long Towbar', equipmentCode: 'LTOW', category: 'T', active: true },
  { equipmentName: 'Short Towbar', equipmentCode: 'STOW', category: 'T', active: true },
  { equipmentName: 'Trestle', equipmentCode: 'TRE', category: 'T', active: true },
] as const;
