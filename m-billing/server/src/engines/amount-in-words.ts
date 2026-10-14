const BELOW_TWENTY = [
  '',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
];

const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function twoDigits(n: number): string {
  if (n < 20) return BELOW_TWENTY[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${BELOW_TWENTY[o]}` : ''}`.trim();
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h ? `${BELOW_TWENTY[h]} HUNDRED` : '';
  const tail = rest ? twoDigits(rest) : '';
  return [head, tail].filter(Boolean).join(' ');
}

function indianNumberWords(n: number): string {
  if (n === 0) return 'ZERO';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const hundred = n % 1000;
  if (crore) parts.push(`${threeDigits(crore)} CRORE`);
  if (lakh) parts.push(`${threeDigits(lakh)} LAKH`);
  if (thousand) parts.push(`${threeDigits(thousand)} THOUSAND`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Indian invoice wording for the printed receivable.
 * The figure on the invoice is rounded to the nearest rupee, so the words
 * are that rupee amount only.
 */
export function amountInWordsInr(amount: number): string {
  const rupees = Math.max(0, Math.round(amount));
  const rupeeWords = indianNumberWords(rupees);
  return `${rupeeWords} RUPEES`;
}

/** USD amount in words — e.g. TWO HUNDRED SEVENTY EIGHT DOLLARS AND TEN CENTS ONLY */
export function amountInWordsUsd(amount: number): string {
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100) % 100;
  const dollarWords = indianNumberWords(dollars);
  const centWords = cents === 0 ? 'ZERO' : twoDigits(cents);
  return `${dollarWords} DOLLARS AND ${centWords} CENTS ONLY`;
}
