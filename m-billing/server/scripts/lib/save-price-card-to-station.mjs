/**
 * Save parsed price-card airlines into billing contracts + BHS price-card rows
 * for a single station. Never writes other stations. Existing rows update in place;
 * missing customers are created as HYD stubs (name from sheet / MAA master).
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMongoUri } from './seed-catalog-from-price-card.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../../api/package.json'));

const DOC_CUSTOMER = 'customer';
const DOC_CONTRACT = 'contract';
const DOC_PRICE_CARD = 'price_card_airline';

function asDate(iso, endOfDay = false) {
  const day = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Date(`${day}T${endOfDay ? '23:59:59.000' : '00:00:00.000'}Z`);
}

function clauseAppliesTo(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  const s = String(value ?? '').trim();
  return s ? [s] : ['all'];
}

function mergeAdsRules(existing, incoming) {
  const out = [...(existing ?? [])];
  for (const rule of incoming ?? []) {
    const key = `${rule.serviceCode}|${rule.category ?? ''}|${(rule.aircraftTypes ?? []).join(',')}|${rule.uom ?? ''}`;
    const idx = out.findIndex(
      (r) =>
        `${r.serviceCode}|${r.category ?? ''}|${(r.aircraftTypes ?? []).join(',')}|${r.uom ?? ''}` === key,
    );
    if (idx >= 0) out[idx] = { ...out[idx], ...rule };
    else out.push(rule);
  }
  return out;
}

/** Categories written for one BHS package. Delhi keeps the sheet's sector. Other stations stay as before. */
export function categoriesForSavedBhsPackage(pkg, stationCode) {
  const station = String(stationCode ?? '').trim().toUpperCase();
  if (station !== 'DEL' && station !== 'COK') {
    return pkg?.category === 'Int' ? ['Int'] : ['Dom', 'Int'];
  }
  if (pkg?.appliesToBoth) return ['Dom', 'Int'];
  if (pkg?.category === 'Int') return ['Int'];
  return ['Dom'];
}

/**
 * Dates and status written for one contract.
 * Delhi keeps the sheet end date. A date already past the seed day stays expired.
 * Other stations still extend a past end date to 31 Mar 2027.
 */
export function savedContractTerm(parsed, stationCode, asOf) {
  const station = String(stationCode ?? '').trim().toUpperCase();
  const validFrom = asDate(parsed?.priceValidFrom);
  const validTo = asDate(parsed?.priceValidTo, true);
  const openEnded = Boolean(parsed?.priceOpenEnded);
  const seedDay = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : null;
  if (
    station !== 'DEL' &&
    seedDay &&
    validTo &&
    validTo.getUTCFullYear() < 2090 &&
    validTo < seedDay
  ) {
    validTo.setTime(Date.parse('2027-03-31T23:59:59.000Z'));
  }
  const expired =
    station === 'DEL' &&
    !openEnded &&
    seedDay &&
    validTo &&
    validTo.getUTCFullYear() < 2090 &&
    validTo < seedDay;
  return {
    validFrom,
    validTo,
    openEnded,
    status: expired ? 'expired' : 'active',
  };
}

/** Contract category stored for this station. Delhi is Both only when the sheet shows both sectors. */
export function contractCategoryForSave(parsed, stationCode) {
  const category = String(parsed?.contractCategory ?? '').trim();
  if (category === 'Dom' || category === 'Int' || category === 'Both') return category;
  if (String(stationCode ?? '').trim().toUpperCase() === 'DEL') return undefined;
  return 'Both';
}

function adsRulesForDb(rules, validFromIso) {
  const month = String(validFromIso ?? '').slice(0, 7);
  return (rules ?? []).map((rule) => ({
    serviceCode: rule.serviceCode,
    includedForAds: rule.includedForAds !== false,
    alwaysChargeable: Boolean(rule.alwaysChargeable),
    freePerFlight: rule.freePerFlight ?? 0,
    freePerFlightNb: rule.freePerFlightNb,
    freePerFlightWb: rule.freePerFlightWb,
    unitPriceINR: rule.unitPriceINR,
    unitPriceUSD: rule.unitPriceUSD,
    uom: rule.uom || 'Per service',
    aircraftTypes: rule.aircraftTypes ?? [],
    category: rule.category,
    remarks: rule.remarks,
    effectiveMonth: month || undefined,
  }));
}

export async function savePriceCardContractsToStation(parsedAirlines, opts = {}) {
  const stationCode = String(opts.stationCode ?? 'HYD').trim().toUpperCase();
  if (!stationCode || stationCode === '*') {
    throw new Error('stationCode is required and cannot be *');
  }
  const dryRun = Boolean(opts.dryRun);
  const mongoose = require('mongoose');
  const uri = loadMongoUri();
  if (!uri) {
    throw new Error('MONGO_URI / MONGODB_URI missing');
  }

  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    const billing = db.collection('billing');
    const now = new Date();

    const summary = {
      stationCode,
      dryRun,
      customersCreated: 0,
      customersExisting: 0,
      contractsCreated: 0,
      contractsUpdated: 0,
      bhsRows: 0,
      adsTwins: 0,
      stalePriceCardsDeactivated: 0,
      skipped: [],
      saved: [],
    };
    const keptPriceKeys = new Set();
    const savedCustomers = new Set();

    for (const parsed of parsedAirlines) {
      const customerCode = String(parsed.customerCode ?? '').trim().toUpperCase();
      const contractNumber = String(parsed.contractNumber ?? '').trim();
      if (!customerCode || !contractNumber) {
        summary.skipped.push({ sheet: parsed.sheetName, reason: 'missing customer/contract number' });
        continue;
      }
      savedCustomers.add(customerCode);
      const term = savedContractTerm(parsed, stationCode, opts.asOf);
      const validFrom = term.validFrom;
      const validTo = term.validTo;
      if (!validFrom || !validTo) {
        summary.skipped.push({ sheet: parsed.sheetName, reason: 'missing validity dates' });
        continue;
      }
      if (validFrom.getUTCFullYear() < 2010 || validTo.getUTCFullYear() < 2010) {
        summary.skipped.push({
          sheet: parsed.sheetName,
          reason: `invalid Excel dates ${parsed.priceValidFrom}..${parsed.priceValidTo}`,
        });
        continue;
      }

      const maaCustomer = await billing.findOne({
        docType: DOC_CUSTOMER,
        stationCode: 'MAA',
        customerCode,
      });
      const delAirline = await db.collection('advance-airline').findOne({
        stationCode,
        code: customerCode,
      });
      const airlineName = String(
        delAirline?.name || parsed.airlineName || maaCustomer?.name || customerCode,
      ).trim();

      const existingCustomer = await billing.findOne({
        docType: DOC_CUSTOMER,
        stationCode,
        customerCode,
      });

      if (!existingCustomer) {
        summary.customersCreated += 1;
        if (!dryRun) {
          await billing.insertOne({
            docType: DOC_CUSTOMER,
            customerCode,
            name: airlineName,
            currencyCode: parsed.currency || maaCustomer?.currencyCode || 'INR',
            stationCode,
            priceCardHandlingTypes: ['BHS', 'ADS'],
            blocked: false,
            active: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      } else {
        summary.customersExisting += 1;
        if (!dryRun) {
          await billing.updateOne(
            { _id: existingCustomer._id, stationCode },
            {
              $set: {
                updatedAt: now,
                priceCardHandlingTypes: ['BHS', 'ADS'],
                ...(parsed.currency ? { currencyCode: parsed.currency } : {}),
                ...(existingCustomer.name ? {} : { name: airlineName }),
              },
            },
          );
        }
      }

      const adsRules = adsRulesForDb(parsed.adsEquipmentRules, parsed.priceValidFrom);
      const clauses = (parsed.clauses ?? []).map((c) => ({
        clauseType: c.clauseType,
        label: c.label,
        body: c.body,
        appliesTo: clauseAppliesTo(c.appliesTo),
      }));
      const existingContract = await billing.findOne({
        docType: DOC_CONTRACT,
        stationCode,
        contractNumber,
      });

      const savedCategory = contractCategoryForSave(parsed, stationCode);
      const contractFields = {
        customerCode,
        stationCode,
        ...(savedCategory ? { category: savedCategory } : {}),
        aircraftTypes: parsed.aircraftTypes ?? [],
        priceValidFrom: validFrom,
        priceValidTo: validTo,
        cancellationWithinHours: parsed.cancellationWithinHours,
        conditionalCharges: parsed.conditionalCharges ?? {},
        clauses,
        adsBillingEnabled: Boolean(parsed.adsBillingEnabled),
        openEnded: term.openEnded,
        status: term.status,
        ...(parsed.bhsConcessionCoverage
          ? {
              bhsConcessionCoverage: parsed.bhsConcessionCoverage,
              bhsConcessionNote: parsed.bhsConcessionNote,
            }
          : {}),
        adsEquipmentRules: existingContract
          ? mergeAdsRules(existingContract.adsEquipmentRules, adsRules)
          : adsRules,
        updatedAt: now,
      };

      if (existingContract) {
        summary.contractsUpdated += 1;
        if (!dryRun) {
          await billing.updateOne(
            { _id: existingContract._id, stationCode },
            savedCategory
              ? { $set: contractFields }
              : { $set: contractFields, $unset: { category: '' } },
          );
        }
      } else {
        summary.contractsCreated += 1;
        if (!dryRun) {
          await billing.insertOne({
            docType: DOC_CONTRACT,
            contractNumber,
            createdAt: now,
            ...contractFields,
          });
        }
      }

      for (const pkg of parsed.bhsPackages ?? []) {
        const aircraftType = String(pkg.aircraftType ?? '').trim();
        if (!aircraftType) continue;
        const categories = categoriesForSavedBhsPackage(pkg, stationCode);
        for (const category of categories) {
          const bhsFilter = {
            docType: DOC_PRICE_CARD,
            stationCode,
            handlingType: 'BHS',
            customerCode,
            aircraftType,
            category,
            validFrom,
          };
          if (!dryRun) {
            await billing.updateOne(
              bhsFilter,
              {
                $set: {
                  handlingType: 'BHS',
                  customerCode,
                  airlineName,
                  aircraftType,
                  category,
                  price: pkg.price,
                  currencyCode: parsed.currency || 'INR',
                  openEnded: term.openEnded,
                  validFrom,
                  validTo,
                  remarks: pkg.remarks,
                  stationCode,
                  active: true,
                  updatedAt: now,
                },
                $setOnInsert: {
                  docType: DOC_PRICE_CARD,
                  createdAt: now,
                },
              },
              { upsert: true },
            );
            await billing.updateOne(
              {
                docType: DOC_PRICE_CARD,
                stationCode,
                handlingType: 'ADS',
                customerCode,
                aircraftType,
                category,
                validFrom,
              },
              {
                $set: {
                  handlingType: 'ADS',
                  customerCode,
                  airlineName,
                  aircraftType,
                  category,
                  currencyCode: parsed.currency || 'INR',
                  openEnded: term.openEnded,
                  validFrom,
                  validTo,
                  remarks: pkg.remarks,
                  stationCode,
                  active: true,
                  updatedAt: now,
                },
                $setOnInsert: {
                  docType: DOC_PRICE_CARD,
                  createdAt: now,
                },
              },
              { upsert: true },
            );
          }
          summary.bhsRows += 1;
          summary.adsTwins += 1;
          const fromKey = validFrom.toISOString();
          keptPriceKeys.add(`${customerCode}|BHS|${aircraftType}|${category}|${fromKey}`);
          keptPriceKeys.add(`${customerCode}|ADS|${aircraftType}|${category}|${fromKey}`);
        }
      }

      summary.saved.push({
        sheet: parsed.sheetName,
        customerCode,
        contractNumber,
        adsRules: adsRules.length,
        bhsPackages: (parsed.bhsPackages ?? []).length,
        valid: `${parsed.priceValidFrom}..${parsed.priceValidTo}`,
        category: parsed.contractCategory,
      });
    }

    if (stationCode === 'DEL' && savedCustomers.size > 0 && !dryRun) {
      const customers = [...savedCustomers];
      const rows = await billing
        .find({
          docType: DOC_PRICE_CARD,
          stationCode: 'DEL',
          customerCode: { $in: customers },
          handlingType: { $in: ['BHS', 'ADS'] },
          active: true,
        })
        .toArray();
      const staleIds = [];
      for (const row of rows) {
        const fromKey = row.validFrom instanceof Date ? row.validFrom.toISOString() : '';
        const key = `${row.customerCode}|${row.handlingType}|${row.aircraftType}|${row.category}|${fromKey}`;
        if (!keptPriceKeys.has(key)) staleIds.push(row._id);
      }
      if (staleIds.length) {
        await billing.updateMany(
          { _id: { $in: staleIds }, stationCode: 'DEL' },
          { $set: { active: false, updatedAt: now } },
        );
      }
      summary.stalePriceCardsDeactivated = staleIds.length;

      const retired = [
        ['CIF-DEL-SGHA', 'CIF', savedCustomers.has('CI')],
        ['8M-DEL-SGHA', '8M', savedCustomers.has('MAIL')],
        ['DAL-DEL-CARGO', 'DAL', savedCustomers.has('DHL')],
        ['QY-DEL-CARGO', 'QY', savedCustomers.has('DHLE')],
      ];
      for (const [contractNumber, customerCode, replaced] of retired) {
        if (!replaced) continue;
        await billing.updateOne(
          { docType: DOC_CONTRACT, stationCode: 'DEL', contractNumber },
          { $set: { status: 'expired', updatedAt: now } },
        );
        const retiredCards = await billing.updateMany(
          {
            docType: DOC_PRICE_CARD,
            stationCode: 'DEL',
            customerCode,
            active: true,
            contractNumber,
          },
          { $set: { active: false, updatedAt: now } },
        );
        if (customerCode !== 'QY') {
          await billing.updateMany(
            {
              docType: DOC_PRICE_CARD,
              stationCode: 'DEL',
              customerCode,
              handlingType: { $in: ['BHS', 'ADS'] },
              active: true,
            },
            { $set: { active: false, updatedAt: now } },
          );
        }
        summary.stalePriceCardsDeactivated += retiredCards.modifiedCount ?? 0;
      }
    }

    return summary;
  } finally {
    await mongoose.disconnect();
  }
}
