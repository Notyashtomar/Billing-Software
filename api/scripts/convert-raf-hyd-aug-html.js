/**
 * Convert HTML-table RAF export (raf_hyd_aug_2026.xls) → real xlsx.
 * Dedupes identical data rows (HTML dump repeats some serials).
 * Run from BWMS/apps/api: node scripts/convert-raf-hyd-aug-html.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const src = path.join(__dirname, '..', 'data', 'raf_hyd_aug_2026.xls');
const dst = path.join(__dirname, '..', 'data', 'raf_hyd_aug_2026.xlsx');

const html = fs.readFileSync(src, 'utf8');
const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

function cellText(raw) {
  return String(raw)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const rows = [];
let m;
while ((m = trRe.exec(html)) !== null) {
  const cells = [];
  let cm;
  tdRe.lastIndex = 0;
  while ((cm = tdRe.exec(m[1])) !== null) cells.push(cellText(cm[1]));
  if (cells.length) rows.push(cells);
}

const header = rows[0] ?? [];
const data = [];
const seen = new Set();
for (const r of rows.slice(1)) {
  if (!r[0] || !String(r[0]).trim()) continue;
  const key = r.join('\u0001');
  if (seen.has(key)) continue;
  seen.add(key);
  data.push(r);
}
const trimmed = [header, ...data];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trimmed), 'Sheet1');
XLSX.writeFile(wb, dst, { compression: true });

const serials = [
  ...new Set(data.map((r) => r[0])),
].map(Number).filter(Number.isFinite);
const codes = {};
for (const r of data) {
  const c = r[6] || '(blank)';
  codes[c] = (codes[c] || 0) + 1;
}
console.log(
  JSON.stringify(
    {
      out: dst,
      size: fs.statSync(dst).size,
      dataRows: data.length,
      distinctSerials: serials.length,
      serialMin: Math.min(...serials),
      serialMax: Math.max(...serials),
      equipmentCodes: codes,
      header: header.slice(0, 12),
      sample: data[0]?.slice(0, 12),
    },
    null,
    2,
  ),
);
