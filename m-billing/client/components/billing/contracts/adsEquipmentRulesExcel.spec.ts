import {
  adsEquipmentRulesExcelFileName,
  resolveImportedEquipmentName,
} from './adsEquipmentRulesExcel';

describe('ads equipment rules excel', () => {
  it('names the file Airline name(code)-ads-equipments', () => {
    expect(adsEquipmentRulesExcelFileName('Virgin Atlantic Airways Limited', 'VS')).toBe(
      'Virgin Atlantic Airways Limited(VS)-ads-equipments.xlsx',
    );
  });

  it('strips characters that Windows will not allow in a file name', () => {
    expect(adsEquipmentRulesExcelFileName('Air/India: Express', 'IX*')).toBe(
      'Air India Express(IX)-ads-equipments.xlsx',
    );
  });

  it('maps an exported label back to the catalog service code', () => {
    expect(
      resolveImportedEquipmentName('Ground Power Unit-140KV', [
        { value: 'Scheduled - Equipment - GPU-140KV', label: 'Ground Power Unit-140KV' },
      ]),
    ).toBe('Scheduled - Equipment - GPU-140KV');
  });
});
