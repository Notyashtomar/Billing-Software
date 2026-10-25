import {
  normalizeFhrEquipmentDetailItems,
  toBillingTrackableFullName,
} from './billing-trackable-equipment-name';

describe('toBillingTrackableFullName', () => {
  it('expands scheduled GSE short codes to billing full forms', () => {
    expect(toBillingTrackableFullName('DT')).toBe('Diesel Tractor');
    expect(toBillingTrackableFullName('C')).toBe('Cones');
    expect(toBillingTrackableFullName('CK')).toBe('Chocks');
    expect(toBillingTrackableFullName('AMB')).toBe('Ambulift');
    expect(toBillingTrackableFullName('GPU-90KV')).toBe('Ground Power Unit - Narrow Body');
    expect(toBillingTrackableFullName('GPU-140KV')).toBe('Ground Power Unit - 140KV');
    expect(toBillingTrackableFullName('GPU(BME)')).toBe('Ground Power Unit (BME)');
    expect(toBillingTrackableFullName('ACU(BME)')).toBe('Air Conditioner Unit (BME)');
    expect(toBillingTrackableFullName('WC(BME)')).toBe('Water Cart (BME)');
    expect(toBillingTrackableFullName('CONVEYOR BELT')).toBe('Conveyor Belt Loader');
    expect(toBillingTrackableFullName('BFL')).toBe('Baggage Freight Loader');
    expect(toBillingTrackableFullName('Ground Power Unit (NB)')).toBe(
      'Ground Power Unit - Narrow Body',
    );
    expect(toBillingTrackableFullName('Tresel')).toBe('Trestle');
    expect(toBillingTrackableFullName('Tow Bar')).toBe('Towbar');
    expect(toBillingTrackableFullName('DBT')).toBe('Diesel Tractor');
    expect(toBillingTrackableFullName('BT-120')).toBe('Baggage Trolly');
    expect(toBillingTrackableFullName('C COH')).toBe('Crew Coach');
    expect(toBillingTrackableFullName('TC')).toBe('Toilet Service');
    expect(toBillingTrackableFullName('PSL')).toBe('Motorized Passenger Step Ladder');
    expect(toBillingTrackableFullName('ASU')).toBe('Air Start Unit');
    expect(toBillingTrackableFullName('TB')).toBe('Towbar');
    expect(toBillingTrackableFullName('gpu 90 kv')).toBe('Ground Power Unit - Narrow Body');
  });

  it('expands manpower codes used on scheduled equipment lines', () => {
    expect(toBillingTrackableFullName('CSA')).toBe('Customer Service Agent');
    expect(toBillingTrackableFullName('Sr. CSA')).toBe('Senior Customer Service Agent');
    expect(toBillingTrackableFullName('DO')).toBe('Duty Officer');
    expect(toBillingTrackableFullName('UH')).toBe('Unit Handling');
    expect(toBillingTrackableFullName('CSH')).toBe('Customer Service Host');
  });

  it('keeps WC as Water Cart for equipment and White Collar for manpower', () => {
    expect(toBillingTrackableFullName('WC', 'equipment')).toBe('Water Cart');
    expect(toBillingTrackableFullName('WC', 'auto')).toBe('Water Cart');
    expect(toBillingTrackableFullName('WC', 'manpower')).toBe('White Collar');
  });

  it('does not invent full forms for billing-untrackable codes', () => {
    expect(toBillingTrackableFullName('c1')).toBe('c1');
    expect(toBillingTrackableFullName('URB')).toBe('URB');
    expect(toBillingTrackableFullName('Coach')).toBe('Coach');
  });

  it('leaves unknown labels unchanged', () => {
    expect(toBillingTrackableFullName('DHC-6')).toBe('DHC-6');
    expect(toBillingTrackableFullName('')).toBe('');
  });
});

describe('normalizeFhrEquipmentDetailItems', () => {
  it('rewrites equipment_name to billing full forms', () => {
    const out = normalizeFhrEquipmentDetailItems([
      { equipment_name: 'LDL', equipment_quantity: 1 },
      { equipment_name: 'c1' },
    ]);
    expect(out[0]?.equipment_name).toBe('Lower Deck Loader');
    expect(out[1]?.equipment_name).toBe('c1');
  });
});
