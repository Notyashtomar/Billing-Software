/**
 * Chandigarh (IXC) station equipment master list.
 * Source: station equipment spreadsheet (active = Yes for all rows).
 */
export const IXC_EQUIPMENT_SEED = [
  { equipmentName: 'Air Conditioner Unit', equipmentCode: 'ACU', active: true },
  {
    equipmentName: 'Air Start Unit-Narrow body',
    equipmentCode: 'ASU-NB',
    active: true,
  },
  {
    equipmentName: 'Air Start Unit-Wide body',
    equipmentCode: 'ASU-WB',
    active: true,
  },
  { equipmentName: 'Aircraft deep cleaning', equipmentCode: 'DC', active: true },
  { equipmentName: 'Ambulift', equipmentCode: 'AMB', active: true },
  { equipmentName: 'Baggage Trollies', equipmentCode: 'BT', active: true },
  { equipmentName: 'Chocks', equipmentCode: 'CK', active: true },
  { equipmentName: 'Cones', equipmentCode: 'C', active: true },
  { equipmentName: 'Container Dollies', equipmentCode: 'CD', active: true },
  {
    equipmentName: 'Conveyor Belt-Towable',
    equipmentCode: 'BFL-Towable',
    active: true,
  },
  { equipmentName: 'Crockery cleaning', equipmentCode: 'CC', active: true },
  { equipmentName: 'DHC-6', equipmentCode: 'BCPL', active: true },
  { equipmentName: 'DHC-6-400', equipmentCode: '', active: true },
  { equipmentName: 'Diesel Tractor', equipmentCode: 'DT', active: true },
  { equipmentName: 'EBT', equipmentCode: 'EBT', active: true },
  { equipmentName: 'Fire Extinguisher', equipmentCode: 'FE', active: true },
  {
    equipmentName: 'Ground Power Unit -140KV',
    equipmentCode: 'GPU-140KV',
    active: true,
  },
  {
    equipmentName: 'Ground Power Unit -90KV',
    equipmentCode: 'GPU-90KV',
    active: true,
  },
  { equipmentName: 'HeadSet', equipmentCode: 'HS', active: true },
  { equipmentName: 'Main Deck Loader', equipmentCode: 'MDL', active: true },
  { equipmentName: 'Passenger Coach', equipmentCode: 'PAX Coach', active: true },
  {
    equipmentName: 'Pax Step Ladder (Remote Bay) Towable',
    equipmentCode: 'PSL-Towable',
    active: true,
  },
  { equipmentName: 'Phenom 300', equipmentCode: 'MTCL', active: true },
  {
    equipmentName: 'PushBack-Narrow Body',
    equipmentCode: 'PBNB',
    active: true,
  },
  {
    equipmentName: 'PushBack-Wide Body',
    equipmentCode: 'PBWB',
    active: true,
  },
  { equipmentName: 'Ramp Car', equipmentCode: 'RC', active: true },
  { equipmentName: 'Toilet Service', equipmentCode: 'TS', active: true },
  { equipmentName: 'Tow Bar', equipmentCode: 'Tow', active: true },
  {
    equipmentName: 'Tow inter Stand- Narrow Body',
    equipmentCode: 'ISTNB',
    active: true,
  },
  {
    equipmentName: 'Tow inter Stand- Wide Body',
    equipmentCode: 'ISTWB',
    active: true,
  },
  { equipmentName: 'Tresel', equipmentCode: 'TRE', active: true },
  { equipmentName: 'Water Cart', equipmentCode: 'WC', active: true },
  { equipmentName: 'Windshield cleaning', equipmentCode: 'WSC', active: true },
  { equipmentName: 'wing Walking', equipmentCode: 'WW', active: true },
] as const;
