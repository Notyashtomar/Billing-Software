import {
  listFormulaSheetColumns,
  listStationWiseSheetColumns,
} from './station-wise-columns.util';

describe('station-wise-columns.util', () => {
  it('lists A–T inputs plus formula columns with samples', () => {
    const all = listStationWiseSheetColumns();
    const formula = listFormulaSheetColumns();
    expect(all.filter((c) => c.kind === 'input')).toHaveLength(20);
    expect(formula.length).toBeGreaterThan(40);
    expect(all.find((c) => c.letter === 'A')?.label).toBe('SerialNo');
    expect(formula.find((c) => c.letter === 'U')?.formulaSample).toContain('IF(F4=J4');
    expect(formula.find((c) => c.letter === 'AG')?.label).toContain('11');
    expect(formula.every((c) => c.kind === 'formula')).toBe(true);
  });
});
