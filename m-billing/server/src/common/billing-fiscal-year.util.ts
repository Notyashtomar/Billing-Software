/** Indian fiscal year label used by invoice / credit-memo number series (Apr–Mar). */

export function currentIndianFiscalYear(now: Date = new Date()): string {
  const y = now.getFullYear() % 100;
  const start = now.getMonth() >= 3 ? y : y - 1;
  return `${String(start).padStart(2, '0')}-${String(start + 1).padStart(2, '0')}`;
}

export function defaultInvoiceSequenceCode(stationCode: string): string {
  return `SI-${String(stationCode ?? '').trim().toUpperCase()}`;
}

export function defaultCreditMemoSequenceCode(stationCode: string): string {
  return `CM-${String(stationCode ?? '').trim().toUpperCase()}`;
}

export function defaultSequencePrefix(
  documentType: 'invoice' | 'credit_memo',
  stationCode: string,
  fiscalYear: string,
): string {
  const code = String(stationCode ?? '').trim().toUpperCase();
  const head = documentType === 'credit_memo' ? 'CM' : 'SI';
  return `${head}/${code}/${fiscalYear}/`;
}

export function documentTypeFromSequenceCode(
  sequenceCode: string,
): 'invoice' | 'credit_memo' {
  return /^CM[-/]/i.test(String(sequenceCode ?? '').trim()) ? 'credit_memo' : 'invoice';
}
