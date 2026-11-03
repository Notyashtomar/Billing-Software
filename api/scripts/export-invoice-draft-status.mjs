/**
 * Developer view of invoice-draft progress.
 *
 * Writes api/dev/invoice-draft-status/{month}/{station}/BHS|ADS/{airline}/status.txt
 * Months are the billing-period start months present on Invoice drafts.
 * An airline appears when it has an active contract at that station overlapping the month.
 * Posted invoices, the bin, RAF, and custom bills are not included.
 *
 * Usage (from api/): node scripts/export-invoice-draft-status.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const DRAFT_STATUSES = ['draft', 'pending_approval', 'approved', 'generated'];
const RANK = { draft: 1, pending_approval: 2, approved: 3, generated: 4 };

const root = dirname(fileURLToPath(import.meta.url));
const uri = (readFileSync(join(root, '../.env'), 'utf8').match(/^MONGO_URI=(.*)$/m) || [])[1];
const outRoot = join(root, '../dev/invoice-draft-status');

function isoDate(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function monthKey(value) {
  return isoDate(value).slice(0, 7);
}

function monthBounds(month) {
  const [year, mon] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, mon - 1, 1)),
    end: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
  };
}

function overlapsMonth(contract, bounds) {
  const from = contract.priceValidFrom ? new Date(contract.priceValidFrom) : new Date(0);
  const to = contract.priceValidTo ? new Date(contract.priceValidTo) : new Date(Date.UTC(2099, 11, 31));
  return from <= bounds.end && to >= bounds.start;
}

function safeCode(value) {
  const code = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  return code || 'UNKNOWN';
}

function headline(drafts) {
  if (drafts.length === 0) return 'MISSING';
  return drafts.reduce((least, draft) => ((RANK[draft.status] ?? 99) < (RANK[least.status] ?? 99) ? draft : least)).status.toUpperCase();
}

function categoryFromLine(line) {
  const text = `${line.serviceCode ?? ''} ${line.description ?? ''}`.toUpperCase();
  if (text.includes('SCHEDULED FLIGHT') || /\bBHS\b/.test(text)) return 'BHS';
  if (/\bADS\b/.test(text) || text.includes('EQUIPMENT')) return 'ADS';
  return '';
}

function money(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

const client = new MongoClient(uri);
await client.connect();
const billing = client.db('test').collection('billing');

const drafts = await billing.find(
  {
    docType: 'invoice_header',
    status: { $in: DRAFT_STATUSES },
    inBin: { $ne: true },
    cancelled: { $ne: true },
  },
  {
    projection: {
      stationCode: 1,
      customerCode: 1,
      customerName: 1,
      status: 1,
      invoiceCategory: 1,
      draftNumber: 1,
      billingPeriodStart: 1,
      billingPeriodEnd: 1,
      currencyCode: 1,
      totalInclTax: 1,
      preparationRecordIds: 1,
    },
  },
).toArray();

const blankIds = drafts
  .filter((draft) => !['BHS', 'ADS'].includes(String(draft.invoiceCategory ?? '').trim().toUpperCase()))
  .filter((draft) => !['RAF', 'CUSTOM'].includes(String(draft.invoiceCategory ?? '').trim().toUpperCase()))
  .map((draft) => draft._id);

const lines = blankIds.length
  ? await billing.find(
    { docType: 'invoice_line', invoiceId: { $in: blankIds } },
    { projection: { invoiceId: 1, serviceCode: 1, description: 1 } },
  ).toArray()
  : [];
const lineCategories = new Map();
for (const line of lines) {
  const found = categoryFromLine(line);
  if (!found) continue;
  const key = String(line.invoiceId);
  const set = lineCategories.get(key) ?? new Set();
  set.add(found);
  lineCategories.set(key, set);
}

const stillBlank = blankIds.filter((id) => !lineCategories.has(String(id)));
const prepIds = drafts
  .filter((draft) => stillBlank.some((id) => String(id) === String(draft._id)))
  .flatMap((draft) => draft.preparationRecordIds ?? []);
const preps = prepIds.length
  ? await billing.find(
    { _id: { $in: prepIds } },
    { projection: { sourceType: 1 } },
  ).toArray()
  : [];
const prepType = new Map(preps.map((prep) => [String(prep._id), String(prep.sourceType ?? '')]));

function draftServices(draft) {
  const category = String(draft.invoiceCategory ?? '').trim().toUpperCase();
  if (category === 'BHS' || category === 'ADS') return [category];
  if (category === 'RAF' || category === 'CUSTOM') return [];
  const fromLines = [...(lineCategories.get(String(draft._id)) ?? [])];
  if (fromLines.length > 0) return fromLines;
  const sources = new Set((draft.preparationRecordIds ?? []).map((id) => prepType.get(String(id))).filter(Boolean));
  const found = [];
  if ([...sources].some((source) => source === 'scheduled_flight' || source === 'bhs')) found.push('BHS');
  if ([...sources].some((source) => source === 'ads')) found.push('ADS');
  return found.length > 0 ? found : ['BHS'];
}

const contracts = await billing.find(
  { docType: 'contract', status: 'active', stationCode: { $exists: true, $ne: '' } },
  {
    projection: {
      stationCode: 1,
      customerCode: 1,
      contractNumber: 1,
      priceValidFrom: 1,
      priceValidTo: 1,
      adsBillingEnabled: 1,
    },
  },
).toArray();

const customers = await billing.find(
  { docType: 'customer' },
  { projection: { stationCode: 1, customerCode: 1, name: 1, airlineInvoiceName: 1 } },
).toArray();
const customerName = new Map();
for (const customer of customers) {
  const name = customer.airlineInvoiceName || customer.name || '';
  customerName.set(`${customer.stationCode}|${String(customer.customerCode).toUpperCase()}`, name);
}
for (const draft of drafts) {
  const key = `${draft.stationCode}|${String(draft.customerCode).toUpperCase()}`;
  if (!customerName.get(key) && draft.customerName) customerName.set(key, draft.customerName);
}

const months = [...new Set(drafts.map((draft) => monthKey(draft.billingPeriodStart)).filter((month) => month.length === 7))].sort();

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const totals = { months: months.length, airlines: 0, missing: 0, present: 0 };

for (const month of months) {
  const bounds = monthBounds(month);
  const monthDrafts = drafts.filter((draft) => monthKey(draft.billingPeriodStart) === month);
  const stations = [...new Set([
    ...contracts.filter((contract) => overlapsMonth(contract, bounds)).map((contract) => contract.stationCode),
    ...monthDrafts.map((draft) => draft.stationCode),
  ])].filter(Boolean).sort();

  for (const station of stations) {
    const stationContracts = contracts.filter(
      (contract) => contract.stationCode === station && overlapsMonth(contract, bounds),
    );
    const byAirline = new Map();
    for (const contract of stationContracts) {
      const code = safeCode(contract.customerCode);
      const row = byAirline.get(code) ?? { code, contracts: [], ads: false };
      row.contracts.push(contract.contractNumber || '');
      if (contract.adsBillingEnabled !== false) row.ads = true;
      byAirline.set(code, row);
    }
    for (const draft of monthDrafts.filter((row) => row.stationCode === station)) {
      const code = safeCode(draft.customerCode);
      if (!byAirline.has(code)) {
        byAirline.set(code, { code, contracts: [], ads: false, draftOnly: true });
      }
      if (draftServices(draft).includes('ADS')) byAirline.get(code).ads = true;
    }

    for (const airline of [...byAirline.values()].sort((a, b) => a.code.localeCompare(b.code))) {
      const services = airline.ads ? ['BHS', 'ADS'] : ['BHS'];
      for (const draft of monthDrafts.filter((row) => row.stationCode === station && safeCode(row.customerCode) === airline.code)) {
        for (const service of draftServices(draft)) {
          if (!services.includes(service)) services.push(service);
        }
      }
      services.sort();
      const name = customerName.get(`${station}|${airline.code}`) || airline.code;

      for (const service of services) {
        const matched = monthDrafts.filter(
          (draft) => draft.stationCode === station
            && safeCode(draft.customerCode) === airline.code
            && draftServices(draft).includes(service),
        );
        const status = headline(matched);
        const dir = join(outRoot, month, station, service, airline.code);
        mkdirSync(dir, { recursive: true });
        const draftLines = matched.length === 0
          ? ['drafts: none']
          : [
            'drafts:',
            ...matched
              .sort((a, b) => String(a.draftNumber).localeCompare(String(b.draftNumber)))
              .map((draft) => `- ${draft.draftNumber} | ${draft.status} | ${isoDate(draft.billingPeriodStart)} to ${isoDate(draft.billingPeriodEnd)} | ${draft.currencyCode ?? ''} ${money(draft.totalInclTax)}`.trim()),
          ];
        writeFileSync(join(dir, 'status.txt'), [
          `status: ${status}`,
          `month: ${month}`,
          `station: ${station}`,
          `service: ${service}`,
          `airline: ${airline.code}`,
          `airlineName: ${name}`,
          `contracts: ${airline.contracts.filter(Boolean).join(', ') || 'none on an active contract'}`,
          'source: Invoice drafts (draft, pending approval, approved, generated)',
          ...draftLines,
          '',
        ].join('\n'), 'utf8');
        totals.airlines += 1;
        if (status === 'MISSING') totals.missing += 1;
        else totals.present += 1;
      }
    }
  }
}

writeFileSync(join(outRoot, 'README.md'), [
  '# Invoice draft status',
  '',
  'Developer snapshot of Invoice drafts. Each path is `month/station/BHS|ADS/airline/status.txt`.',
  '',
  'The month is the draft billing-period start. An airline is listed when an active contract at that station overlaps the month. `MISSING` means that contract has no invoice draft for the service in that month.',
  '',
  'Posted invoices, binned drafts, cancelled drafts, RAF, and custom bills are not part of this tree.',
  '',
  'Refresh from `api/` with `node scripts/export-invoice-draft-status.mjs`.',
  '',
  `Last built for ${months[0] ?? '—'} through ${months.at(-1) ?? '—'}. ${totals.airlines} airline folders, ${totals.present} with a draft, ${totals.missing} missing.`,
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ outRoot, months, ...totals }, null, 2));
await client.close();
