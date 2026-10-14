/** Indian fiscal year label used by invoice / credit-memo number series (Apr–Mar). */

export function currentIndianFiscalYear(now: Date = new Date()): string {
  const y = now.getFullYear() % 100;
  const start = now.getMonth() >= 3 ? y : y - 1;
  return `${String(start).padStart(2, '0')}-${String(start + 1).padStart(2, '0')}`;
}

export function billingStationCodeFromSession(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('userStationCode') ?? '').trim().toUpperCase();
}

export function defaultInvoiceSequenceForm(
  documentType: 'invoice' | 'credit_memo' = 'invoice',
  stationCode = billingStationCodeFromSession(),
  fiscalYear = currentIndianFiscalYear(),
) {
  const station = stationCode.trim().toUpperCase();
  const head = documentType === 'credit_memo' ? 'CM' : 'SI';
  return {
    sequenceCode: station ? `${head}-${station}` : '',
    prefix: station ? `${head}/${station}/${fiscalYear}/` : '',
    fiscalYear,
    documentType,
  };
}
