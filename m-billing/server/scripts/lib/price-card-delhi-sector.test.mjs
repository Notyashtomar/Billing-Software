import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '../../../../../apps/api');
const require = createRequire(resolve(apiRoot, 'package.json'));
const ExcelJS = require('exceljs');
const parser = await import(new URL('./price-card-maa-parser.mjs', import.meta.url));
const saver = await import(new URL('./save-price-card-to-station.mjs', import.meta.url));

const { parsePriceCardSheet, parsePriceCardWorkbook } = parser;
const { categoriesForSavedBhsPackage, contractCategoryForSave, savedContractTerm } = saver;

const DELHI_FILE = resolve(apiRoot, 'data/Price_card_Delhi_V2.xlsx');
const asOf = new Date('2026-08-15T00:00:00');
const delhiOpts = { asOf, stationCode: 'DEL', includeExtraAds: true, collectBhsPackages: true };

function identicalDomIntPairs(rules) {
  const groups = new Map();
  for (const rule of rules ?? []) {
    const key = [
      rule.serviceCode,
      (rule.aircraftTypes ?? []).join(','),
      rule.uom,
      rule.unitPriceINR ?? rule.unitPriceUSD ?? '',
    ].join('|');
    const cats = groups.get(key) ?? new Set();
    if (rule.category) cats.add(rule.category);
    groups.set(key, cats);
  }
  let pairs = 0;
  for (const cats of groups.values()) {
    if (cats.has('Dom') && cats.has('Int')) pairs += 1;
  }
  return pairs;
}

function packageByLabel(parsed, pattern) {
  return (parsed.bhsPackages ?? []).find((row) => pattern.test(row.aircraftType) || pattern.test(row.remarks ?? ''));
}

test('Delhi saver does not copy a domestic package onto international', () => {
  assert.deepEqual(categoriesForSavedBhsPackage({ category: 'Dom', appliesToBoth: false }, 'DEL'), ['Dom']);
  assert.deepEqual(categoriesForSavedBhsPackage({ category: 'Int', appliesToBoth: false }, 'DEL'), ['Int']);
  assert.deepEqual(categoriesForSavedBhsPackage({ category: 'Dom', appliesToBoth: true }, 'DEL'), ['Dom', 'Int']);
  assert.deepEqual(categoriesForSavedBhsPackage({ category: 'Dom' }, 'MAA'), ['Dom', 'Int']);
  assert.deepEqual(categoriesForSavedBhsPackage({ category: 'Int' }, 'HYD'), ['Int']);
});

test('Delhi contract is Both only when the sheet shows both sectors', () => {
  assert.equal(contractCategoryForSave({ contractCategory: 'Both' }, 'DEL'), 'Both');
  assert.equal(contractCategoryForSave({ contractCategory: 'Dom' }, 'DEL'), 'Dom');
  assert.equal(contractCategoryForSave({ contractCategory: 'Int' }, 'DEL'), 'Int');
  assert.equal(contractCategoryForSave({ contractCategory: '' }, 'DEL'), undefined);
  assert.equal(contractCategoryForSave({ contractCategory: '' }, 'MAA'), 'Both');
});

test('SpiceJet domestic and international prices stay on their own sector', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DELHI_FILE);
  const sg = parsePriceCardSheet(wb.getWorksheet('SG'), delhiOpts);
  assert.equal(sg.contractCategory, 'Both');

  const dom = (sg.bhsPackages ?? []).filter((row) => /B737-DOM/i.test(row.remarks ?? ''));
  const intl = (sg.bhsPackages ?? []).filter((row) => /B737-INLT/i.test(row.remarks ?? ''));
  assert.ok(dom.length >= 1);
  assert.ok(intl.length >= 1);
  assert.equal(dom[0].category, 'Dom');
  assert.equal(dom[0].appliesToBoth, false);
  assert.equal(intl[0].category, 'Int');
  assert.equal(intl[0].appliesToBoth, false);
  assert.notEqual(dom[0].price, intl[0].price);
  assert.deepEqual(categoriesForSavedBhsPackage(dom[0], 'DEL'), ['Dom']);
  assert.deepEqual(categoriesForSavedBhsPackage(intl[0], 'DEL'), ['Int']);
});

test('Akasa domestic columns stay domestic and international columns stay international', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DELHI_FILE);
  const akasa = parsePriceCardSheet(wb.getWorksheet('Akasa New'), delhiOpts);
  assert.equal(akasa.contractCategory, 'Both');
  const domestic = (akasa.bhsPackages ?? []).filter((row) => /Flight Per Month 1-500|Flight Per Month 1-400/i.test(row.remarks ?? ''));
  const international = (akasa.bhsPackages ?? []).filter((row) => /Flight Per Month 1-150/i.test(row.remarks ?? ''));
  assert.ok(domestic.length >= 1);
  assert.ok(international.length >= 1);
  for (const row of domestic) {
    assert.equal(row.category, 'Dom');
    assert.equal(row.appliesToBoth, false);
    assert.deepEqual(categoriesForSavedBhsPackage(row, 'DEL'), ['Dom']);
  }
  for (const row of international) {
    assert.equal(row.category, 'Int');
    assert.equal(row.appliesToBoth, false);
    assert.deepEqual(categoriesForSavedBhsPackage(row, 'DEL'), ['Int']);
  }
});

test('every Delhi airline follows the sheet sector', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DELHI_FILE);
  const parsed = parsePriceCardWorkbook(wb, delhiOpts);
  assert.ok(parsed.length >= 60);
  for (const airline of parsed) {
    if (airline.contractCategory === 'Both') {
      assert.deepEqual(airline.flightCategories, ['Dom', 'Int']);
    } else {
      assert.notEqual(airline.contractCategory, 'Both');
      assert.equal(identicalDomIntPairs(airline.adsEquipmentRules), 0);
      for (const row of airline.bhsPackages ?? []) {
        assert.equal(row.appliesToBoth, false);
        const written = categoriesForSavedBhsPackage(row, 'DEL');
        assert.equal(written.length, 1);
        assert.equal(written[0], row.category);
      }
    }
    for (const row of airline.bhsPackages ?? []) {
      if (row.category === 'Dom' && !row.appliesToBoth) {
        assert.deepEqual(categoriesForSavedBhsPackage(row, 'DEL'), ['Dom']);
      }
      if (row.category === 'Int') {
        assert.deepEqual(categoriesForSavedBhsPackage(row, 'DEL'), ['Int']);
      }
    }
  }
});

test('Chennai cards with no sector words still save as both', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('BA');
  sheet.getCell('A3').value = 'From';
  sheet.getCell('B3').value = 'To';
  sheet.getCell('D3').value = 'GPU';
  sheet.getCell('A4').value = new Date(2026, 0, 1);
  sheet.getCell('B4').value = new Date(2026, 11, 31);
  sheet.getCell('D4').value = 100;
  const maa = parsePriceCardSheet(sheet, { ...delhiOpts, stationCode: 'MAA' });
  const del = parsePriceCardSheet(sheet, delhiOpts);
  assert.equal(maa.contractCategory, 'Both');
  assert.equal(identicalDomIntPairs(maa.adsEquipmentRules) > 0, true);
  assert.equal(del.contractCategory, '');
  assert.equal(identicalDomIntPairs(del.adsEquipmentRules), 0);
  assert.equal(contractCategoryForSave(maa, 'MAA'), 'Both');
  assert.equal(contractCategoryForSave(del, 'DEL'), undefined);
});

test('Delhi keeps sheet dates, separates old sheets, and does not store services as aircraft', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DELHI_FILE);
  const parsed = parsePriceCardWorkbook(wb, delhiOpts);
  const bySheet = new Map(parsed.map((row) => [row.sheetName, row]));
  const byContract = new Map(parsed.map((row) => [row.contractNumber, row]));

  assert.ok(bySheet.has('Akasa'));
  assert.notEqual(bySheet.get('Akasa').contractNumber, bySheet.get('Akasa New').contractNumber);
  assert.equal(bySheet.get('Akasa New').contractNumber, 'QP-DEL-SGHA');
  assert.notEqual(bySheet.get('LHF').contractNumber, bySheet.get('LHF-1').contractNumber);
  assert.equal(bySheet.get('LHF').contractNumber, 'LHF-DEL-CARGO');

  assert.equal(byContract.get('CI-DEL-SGHA')?.customerCode, 'CI');
  assert.equal(byContract.has('CIF-DEL-SGHA'), false);
  assert.equal(bySheet.get('MAIL').customerCode, 'MAIL');
  assert.equal(bySheet.get('DHL Express').customerCode, 'DHLE');
  assert.notEqual(bySheet.get('DHL Express').customerCode, bySheet.get('QY').customerCode);
  assert.equal(bySheet.get('DHL').customerCode, 'DHL');

  const ba = bySheet.get('BA');
  assert.equal(ba.bhsPackages.some((row) => /coach/i.test(row.aircraftType)), false);
  assert.equal(ba.adsEquipmentRules.some((row) => /coach/i.test(row.serviceCode)), true);
  const baTerm = savedContractTerm(ba, 'DEL', asOf);
  assert.equal(baTerm.status, 'expired');
  assert.equal(baTerm.validTo.toISOString().slice(0, 10), '2026-05-14');

  const cxf = bySheet.get('CXF');
  assert.equal(cxf.priceOpenEnded, true);

  const akasa = bySheet.get('Akasa New');
  const bands = akasa.bhsPackages.map((row) => `${row.aircraftType}|${row.remarks ?? ''}`);
  assert.equal(bands.every((name) => /^B737-800\|/i.test(name)), true);
  assert.equal(bands.some((name) => /1-500/.test(name) && /Comprehensive/i.test(name)), true);
  assert.equal(bands.some((name) => /1-500/.test(name) && /Ramp/i.test(name)), true);

  for (const airline of parsed) {
    for (const row of airline.bhsPackages) {
      const text = String(row.price);
      const decimals = text.includes('.') ? text.split('.')[1] : '';
      assert.ok(decimals.length <= 2, `${airline.sheetName} ${row.aircraftType} ${text}`);
    }
  }

  const maaPast = savedContractTerm(
    { priceValidFrom: '2025-01-01', priceValidTo: '2026-05-14' },
    'MAA',
    asOf,
  );
  assert.equal(maaPast.validTo.toISOString().slice(0, 10), '2027-03-31');
  assert.equal(maaPast.status, 'active');
});

test('Delhi does not copy a blank current price from an older addendum', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('BA');
  sheet.getCell('A3').value = 'From';
  sheet.getCell('B3').value = 'To';
  sheet.getCell('D3').value = 'B777';
  sheet.getCell('E3').value = 'GPU';
  sheet.getCell('A4').value = new Date(2024, 0, 1);
  sheet.getCell('B4').value = new Date(2024, 11, 31);
  sheet.getCell('D4').value = 1000;
  sheet.getCell('E4').value = 50;
  sheet.getCell('A5').value = new Date(2026, 0, 1);
  sheet.getCell('B5').value = new Date(2026, 11, 31);
  sheet.getCell('D5').value = 1200;
  const del = parsePriceCardSheet(sheet, delhiOpts);
  const maa = parsePriceCardSheet(sheet, { ...delhiOpts, stationCode: 'MAA', includeExtraAds: true });
  assert.equal(del.bhsPackages.some((row) => row.aircraftType === 'B777' && row.price === 1200), true);
  assert.equal(del.adsEquipmentRules.some((row) => row.serviceCode.includes('GPU')), false);
  assert.equal(maa.adsEquipmentRules.some((row) => String(row.serviceCode).includes('GPU')), true);
});
