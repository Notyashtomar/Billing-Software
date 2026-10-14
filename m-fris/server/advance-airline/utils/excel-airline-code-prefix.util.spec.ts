import {
  excelAirlineCodePrefix,
  pickExcelAirlineRow,
} from './excel-airline-code-prefix.util';

describe('excelAirlineCodePrefix', () => {
  it('uses the token before the first hyphen', () => {
    expect(excelAirlineCodePrefix('AC-MAA')).toBe('AC');
    expect(excelAirlineCodePrefix('6E-MA')).toBe('6E');
    expect(excelAirlineCodePrefix('ACA-MAA')).toBe('ACA');
  });

  it('strips junk and uppercases', () => {
    expect(excelAirlineCodePrefix(' ac-maa ')).toBe('AC');
    expect(excelAirlineCodePrefix('JD-MA-OLD')).toBe('JD');
  });
});

describe('pickExcelAirlineRow', () => {
  it('prefers Schedule over Non-Schedule for the same prefix', () => {
    const chosen = pickExcelAirlineRow([
      { excelCode: '8D-MAA', operation: 'Non-Schedule' },
      { excelCode: '8D-MA', operation: 'Schedule' },
    ]);
    expect(chosen?.excelCode).toBe('8D-MA');
  });

  it('skips -OLD when a live row exists', () => {
    const chosen = pickExcelAirlineRow([
      { excelCode: 'JD-MA-OLD', operation: 'Schedule' },
      { excelCode: 'JD-MA', operation: 'Schedule' },
    ]);
    expect(chosen?.excelCode).toBe('JD-MA');
  });
});
