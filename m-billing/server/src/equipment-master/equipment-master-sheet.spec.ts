import {
  cleanEquipmentMasterUoms,
  equipmentMasterRowsFromSheet,
  replaceEquipmentMasterAbbreviationValue,
  replaceEquipmentMasterUomValue,
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

  it('renames a UOM and drops a duplicate that already used the new name', () => {
    expect(
      replaceEquipmentMasterUomValue(
        [
          { uom: 'per 15 mins', abbreviation: 'P15' },
          { uom: 'Per 15 Minutes', abbreviation: 'P15M' },
          { uom: 'Per Hour', abbreviation: 'PH' },
        ],
        'per 15 mins',
        'Per 15 Minutes',
      ),
    ).toEqual({
      changed: true,
      uoms: [
        { uom: 'Per 15 Minutes', abbreviation: 'P15' },
        { uom: 'Per Hour', abbreviation: 'PH' },
      ],
    });
  });

  it('only replaces the exact spelling so mixed-case UOMs can be unified', () => {
    expect(
      replaceEquipmentMasterUomValue(
        [
          { uom: 'Per service', abbreviation: '' },
          { uom: 'Per Service', abbreviation: '' },
        ],
        'Per service',
        'Per Service',
      ),
    ).toEqual({
      changed: true,
      uoms: [{ uom: 'Per Service', abbreviation: '' }],
    });
  });

  it('renames an abbreviation on every matching pair', () => {
    expect(
      replaceEquipmentMasterAbbreviationValue(
        [
          { uom: 'Per Hour', abbreviation: 'PH' },
          { uom: 'Per Service', abbreviation: 'PS' },
          { uom: 'Per Tow', abbreviation: 'PH' },
        ],
        'PH',
        'Hr',
      ),
    ).toEqual({
      changed: true,
      uoms: [
        { uom: 'Per Hour', abbreviation: 'Hr' },
        { uom: 'Per Service', abbreviation: 'PS' },
        { uom: 'Per Tow', abbreviation: 'Hr' },
      ],
    });
  });
});
