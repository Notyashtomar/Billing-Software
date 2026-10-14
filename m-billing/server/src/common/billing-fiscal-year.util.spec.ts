import {
  currentIndianFiscalYear,
  defaultInvoiceSequenceCode,
  defaultSequencePrefix,
  documentTypeFromSequenceCode,
} from './billing-fiscal-year.util';

describe('billing fiscal year helpers', () => {
  it('uses Apr–Mar Indian FY (Sep 2026 → 26-27)', () => {
    expect(currentIndianFiscalYear(new Date('2026-09-07T00:00:00Z'))).toBe('26-27');
  });

  it('uses previous FY before April', () => {
    expect(currentIndianFiscalYear(new Date('2026-03-15T00:00:00Z'))).toBe('25-26');
  });

  it('builds default invoice sequence ids', () => {
    expect(defaultInvoiceSequenceCode('maa')).toBe('SI-MAA');
    expect(defaultSequencePrefix('invoice', 'MAA', '26-27')).toBe('SI/MAA/26-27/');
    expect(documentTypeFromSequenceCode('CM-MAA')).toBe('credit_memo');
    expect(documentTypeFromSequenceCode('SI-MAA')).toBe('invoice');
  });
});
