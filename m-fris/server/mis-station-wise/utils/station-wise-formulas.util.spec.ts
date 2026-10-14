import {
  dataRowFormulas,
  previewSumFormula,
} from './station-wise-formulas.util';

describe('station-wise-formulas.util', () => {
  it('applies the same MAA row-4 formulas on any data row', () => {
    const r4 = dataRowFormulas(4);
    const r9 = dataRowFormulas(9);
    expect(r4.U).toBe('IF(F4=J4,0,1)');
    expect(r9.U).toBe('IF(F9=J9,0,1)');
    expect(r4.W).toContain('$W$2');
    expect(r9.AG).toContain('$AG$3');
    expect(r4.BI).toBe('IF($BH4<BI$3,1,0)-BE4');
    expect(r9.BI).toBe('IF($BH9<BI$3,1,0)-BE9');
    expect(Object.keys(r4).length).toBe(Object.keys(r9).length);
  });

  it('sums preview metrics across month sheets', () => {
    expect(previewSumFormula(['JAN26', 'FEB26'], 'FG6')).toBe(
      "'JAN26'!FG6+'FEB26'!FG6",
    );
  });
});
