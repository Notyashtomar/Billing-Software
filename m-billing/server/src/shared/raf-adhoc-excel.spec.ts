import { parseRafAdhocSheetRows } from './raf-adhoc-excel';

describe('parseRafAdhocSheetRows', () => {
  it('skips first column and section headers', () => {
    const rows = parseRafAdhocSheetRows([
      ['ANNEX A SECTIONS', 'EQUIPMENTS', 'REMARKS', null, 'Domestic (INR)', "Int'l USD"],
      ['2.1.3(a)6', 'Ambulift', null, 'Per Usage', 13885, 182],
      ['Passenger/Terminal Side and Manpower related.', null, null, null, null, null],
      ['ANNEX A SECTIONS', 'SERVICES', 'REMARKS', null, 'Domestic (INR)', "Int'l USD"],
      [null, 'ULD Storage (All type of ULDs / Pallets)', null, null, null, null],
      [null, 'LD3', 'Passenger / Cargo', 'per day', 687, 9],
      ['2.1.3(a)7', 'Manpower (Blue collar)', null, 'per personnel/hr.', 1755, 23],
      ['2.2.5', 'Excess Baggage Collection', null, 'per flight', '10%', '10%'],
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      itemKind: 'equipment',
      label: 'Ambulift',
      uom: 'Per Usage',
      unitPriceINR: 13885,
      unitPriceUSD: 182,
    });
    expect(rows.find((r) => r.label === 'LD3')?.itemKind).toBe('service');
    expect(rows.find((r) => r.label.startsWith('Manpower'))?.itemKind).toBe('manpower');
    expect(rows.find((r) => r.label.includes('Excess'))?.percentValue).toBe(10);
  });
});
