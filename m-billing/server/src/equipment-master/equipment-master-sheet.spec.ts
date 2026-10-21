import {
  cleanEquipmentMasterUoms,
  equipmentMasterRowsFromSheet,
} from './equipment-master-sheet';

describe('equipmentMasterRowsFromSheet', () => {
  it('keeps every UOM and abbreviation pair and skips the header', () => {
    const rows = equipmentMasterRowsFromSheet([
      ['No.', 'Description', 'Unit Type', 'UOM', 'Abbreviations', 'UOM', 'Abbreviations'],
      ['ACU', 'Air Conditioner Unit', 'Equipment Used', 'Per Hour', 'PH', 'Per Service', 'PS', '', ''],
      ['', '', '', '', ''],
      ['M', 'Manpower', 'Manpower', 'Per Hour', 'PH'],
    ]);

    expect(rows).toEqual([
      {
        sortIndex: 0,
        itemNo: 'ACU',
        description: 'Air Conditioner Unit',
        unitType: 'Equipment Used',
        uoms: [
          { uom: 'Per Hour', abbreviation: 'PH' },
          { uom: 'Per Service', abbreviation: 'PS' },
        ],
      },
      {
        sortIndex: 1,
        itemNo: 'M',
        description: 'Manpower',
        unitType: 'Manpower',
        uoms: [{ uom: 'Per Hour', abbreviation: 'PH' }],
      },
    ]);
  });

  it('drops blank UOM pairs', () => {
    expect(
      cleanEquipmentMasterUoms([
        { uom: ' Per Tow ', abbreviation: ' PT ' },
        { uom: '', abbreviation: '' },
        null,
      ]),
    ).toEqual([{ uom: 'Per Tow', abbreviation: 'PT' }]);
  });
});
