/**
 * Apply each contract's yearly increase for the year that contains 30 Oct 2026.
 * The printed annex price stays in force until that year's anniversary.
 * Rate cards and BHS price cards are split on that date so earlier billing
 * still uses the original figure. Running this again does not compound.
 *
 * Usage (from api/): node scripts/apply-current-year-rate-increase.mjs
 * Dry run: node scripts/apply-current-year-rate-increase.mjs --dry-run
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient, ObjectId } = require('mongodb');

const TODAY = '2026-10-30';
const DRY = process.argv.includes('--dry-run');
const MARK = 'CYI:';

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function parseYmd(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function addYears(date, years) {
  const next = new Date(date.getTime());
  const month = next.getUTCMonth();
  next.setUTCFullYear(next.getUTCFullYear() + years);
  if (next.getUTCMonth() !== month) next.setUTCDate(0);
  return next;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function endOfPreviousDay(date) {
  return new Date(date.getTime() - 1);
}

function roundMoney(amount, currency) {
  const code = String(currency ?? 'INR').toUpperCase();
  if (code === 'USD') return Math.round(amount * 100) / 100;
  return Math.round(amount);
}

function contractText(contract) {
  return [
    contract.bhsConcessionNote || '',
    ...(contract.clauses || []).map((clause) => `${clause.label || ''}: ${clause.body || ''}`),
  ].join('\n');
}

function increaseSentences(text) {
  return text
    .split(/(?<=[.])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) =>
      /cpi|escalat|yoy|year on year|year-on-year|annually|per annum|anniversary|%\s*a year|%\s*each year|(?:rate|charge|handling|annex).{0,80}increas|increas.{0,80}(?:rate|charge|cpi|%|year)/i.test(line),
    )
    .filter((line) => !/^1\.10:/i.test(line) || /\d/.test(line));
}

function wordPercent(line) {
  if (/four and a half|4\.5/i.test(line)) return [4.5];
  if (/three point five|3\.5/i.test(line)) return [3.5];
  const map = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const found = [];
  const re = /\b(three|four|five|six|seven|eight)\b(?:\s+percentage|\s+percent)?(?:\s*\((\d+(?:\.\d+)?)%\))?/gi;
  let match;
  while ((match = re.exec(line))) {
    found.push(match[2] ? Number(match[2]) : map[match[1].toLowerCase()]);
  }
  return found;
}

function numericPercents(line) {
  const found = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?)/gi;
  let match;
  while ((match = re.exec(line))) found.push(Number(match[1]));
  return found;
}

function sentencePercents(line) {
  const numeric = numericPercents(line);
  if (numeric.length > 0) return numeric;
  return wordPercent(line);
}

function noisePercent(line, value) {
  if (value >= 15 && /concession|royalty|tax|gst/i.test(line)) return true;
  return false;
}

function explicitDates(line) {
  const dates = [];
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})/g;
  let match;
  while ((match = re.exec(line))) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month == null) continue;
    dates.push(new Date(Date.UTC(Number(match[3]), month, Number(match[1]))));
  }
  return dates;
}

function policyFor(contract) {
  const text = contractText(contract);
  if (/year-by-year table is the loaded schedule/i.test(text)) return null;
  if (/current Hyderabad turnaround is Rs/i.test(text)) return null;
  const sentences = increaseSentences(text).filter((line) => !/^1\.10:\s*Yearly increase percent, if the airline has one\.?$/i.test(line));
  if (sentences.length === 0) return null;
  if (sentences.every((line) => /mutually agreed/i.test(line) && !/shall be increased by|will be increased by|increase(?:s|d)? by \d/i.test(line))) {
    return null;
  }

  const percents = [];
  for (const line of sentences) {
    for (const value of sentencePercents(line)) {
      if (!noisePercent(line, value) && value > 0 && value < 15) percents.push({ value, line });
    }
  }
  if (percents.length === 0) return null;

  const from = contract.priceValidFrom instanceof Date
    ? new Date(Date.UTC(
      contract.priceValidFrom.getUTCFullYear(),
      contract.priceValidFrom.getUTCMonth(),
      contract.priceValidFrom.getUTCDate(),
    ))
    : parseYmd(contract.priceValidFrom);
  if (!from) return null;

  let first = addYears(from, 1);
  const joined = sentences.join(' ');
  if (/second anniversary/i.test(joined)) {
    const second = addYears(from, 2);
    if (second > first) first = second;
  }

  const dated = sentences.flatMap((line) => {
    if (!/from|effective|after|until|thereafter|starting/i.test(line)) return [];
    return explicitDates(line).map((date) => ({ date, line }));
  });
  const afterUntil = dated.filter(({ line }) => /until|through|run to|valid .+ to/i.test(line));
  if (afterUntil.length > 0) {
    const last = afterUntil.sort((a, b) => a.date - b.date)[afterUntil.length - 1];
    first = addDays(last.date, 1);
  } else {
    const starts = dated
      .filter(({ line }) => /from|effective|starting|thereafter/i.test(line))
      .map(({ date }) => date)
      .filter((date) => date > from)
      .sort((a, b) => a - b);
    if (starts.length > 0) first = starts[0];
  }
  const fullText = contractText(contract);
  if (/3rd year|third year/i.test(fullText)) {
    const thirdYear = addYears(from, 2);
    if (thirdYear > first) first = thirdYear;
  }
  if (/valid for (?:a period of )?(?:three|3) years/i.test(fullText)) {
    const afterThree = addYears(from, 3);
    if (afterThree > first) first = afterThree;
  }

  const today = parseYmd(TODAY);
  const validTo = contract.priceValidTo instanceof Date ? contract.priceValidTo : parseYmd(contract.priceValidTo);
  let steps = 0;
  let windowStart = null;
  for (let i = 0; i < 20; i += 1) {
    const anniversary = addYears(first, i);
    if (anniversary <= from) continue;
    if (validTo && anniversary > validTo) break;
    if (anniversary > today) break;
    windowStart = anniversary;
    steps += 1;
  }
  if (steps < 1 || !windowStart) return null;

  const subsequent = percents.find((row) => /subsequently|second and third|thereafter/i.test(row.line));
  const firstPercent = percents[0].value;
  const laterPercent = subsequent?.value ?? firstPercent;
  let factor = 1 + firstPercent / 100;
  for (let i = 1; i < steps; i += 1) factor *= 1 + laterPercent / 100;

  const escalatedBands = new Set();
  for (const schedule of contract.bhsVolumeSchedules || []) {
    const note = `${schedule.note || ''} ${schedule.label || ''}`;
    const start = String(schedule.effectiveFrom || '');
    if (/escalat/i.test(note) || (start && start >= ymd(windowStart))) {
      for (const band of schedule.bands || []) {
        if (band.unitPriceINR > 0) escalatedBands.add(Math.round(band.unitPriceINR));
      }
    }
  }

  return {
    contractId: String(contract._id),
    contractNumber: contract.contractNumber || '',
    customerCode: String(contract.customerCode || '').toUpperCase(),
    stationCode: String(contract.stationCode || '').toUpperCase(),
    percent: laterPercent,
    firstPercent,
    steps,
    factor,
    windowStart,
    windowYmd: ymd(windowStart),
    escalatedBands,
    priceValidFrom: from,
    priceValidTo: contract.priceValidTo instanceof Date ? contract.priceValidTo : parseYmd(contract.priceValidTo),
  };
}

function alreadyMarked(remarks, policy) {
  return String(remarks || '').includes(`${MARK}${policy.contractNumber}:${policy.windowYmd}:`);
}

function mark(remarks, policy) {
  const tag = `${MARK}${policy.contractNumber}:${policy.windowYmd}:${policy.percent}%x${policy.steps}`;
  const text = String(remarks || '').trim();
  return text ? `${text} ${tag}` : tag;
}

function overlapsContract(cardFrom, cardTo, policy) {
  if (!policy.priceValidTo) return true;
  return cardFrom <= policy.priceValidTo && cardTo >= policy.priceValidFrom;
}

async function main() {
  const client = new MongoClient(loadMongoUri());
  await client.connect();
  const col = client.db('test').collection('billing');
  const contracts = await col.find({ docType: 'contract' }).toArray();
  const policies = contracts.map(policyFor).filter(Boolean);
  policies.sort((a, b) => b.priceValidFrom - a.priceValidFrom);

  const byCustomer = new Map();
  for (const policy of policies) {
    const key = `${policy.stationCode}|${policy.customerCode}`;
    const list = byCustomer.get(key) || [];
    list.push(policy);
    byCustomer.set(key, list);
  }

  let priceCards = 0;
  let rateCards = 0;
  let rules = 0;
  let schedules = 0;
  const lines = [];

  for (const policy of policies) {
    lines.push(
      `${policy.stationCode} ${policy.customerCode} ${policy.contractNumber}: +${policy.percent}% x${policy.steps} from ${policy.windowYmd} (factor ${policy.factor.toFixed(6)})`,
    );
  }

  const priceRows = await col.find({
    docType: 'price_card_airline',
    price: { $gt: 0 },
  }).toArray();

  for (const card of priceRows) {
    const key = `${String(card.stationCode || '').toUpperCase()}|${String(card.customerCode || '').toUpperCase()}`;
    const options = byCustomer.get(key) || [];
    const cardFrom = card.validFrom instanceof Date ? card.validFrom : new Date(card.validFrom);
    const cardTo = card.validTo instanceof Date ? card.validTo : new Date(card.validTo);
    const policy = options.find((item) => overlapsContract(cardFrom, cardTo, item));
    if (!policy) continue;
    if (alreadyMarked(card.remarks, policy)) continue;
    if (policy.escalatedBands.has(Math.round(Number(card.price)))) continue;
    if (cardTo < policy.windowStart) continue;

    const nextPrice = roundMoney(Number(card.price) * policy.factor, card.currencyCode || 'INR');
    if (!(nextPrice > 0) || nextPrice === Number(card.price)) continue;

    if (cardFrom >= policy.windowStart) {
      if (!DRY) {
        await col.updateOne({ _id: card._id }, {
          $set: { price: nextPrice, remarks: mark(card.remarks, policy), updatedAt: new Date() },
        });
      }
      priceCards += 1;
      continue;
    }

    if (!DRY) {
      await col.updateOne({ _id: card._id }, {
        $set: { validTo: endOfPreviousDay(policy.windowStart), updatedAt: new Date() },
      });
      const { _id, ...copy } = card;
      await col.insertOne({
        ...copy,
        price: nextPrice,
        validFrom: policy.windowStart,
        remarks: mark(card.remarks, policy),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    priceCards += 1;
  }

  const rateRows = await col.find({
    docType: 'rate_card',
    $or: [{ unitPriceINR: { $gt: 0 } }, { unitPriceUSD: { $gt: 0 } }],
  }).toArray();
  const policyById = new Map(policies.map((policy) => [policy.contractId, policy]));

  for (const card of rateRows) {
    const policy = policyById.get(String(card.contractId || ''));
    if (!policy) continue;
    if (alreadyMarked(card.remarks, policy)) continue;
    const cardFrom = card.validFrom instanceof Date ? card.validFrom : new Date(card.validFrom);
    const cardTo = card.validTo instanceof Date ? card.validTo : new Date(card.validTo || policy.priceValidTo);
    if (cardTo < policy.windowStart) continue;
    const inr = Number(card.unitPriceINR || 0);
    const usd = Number(card.unitPriceUSD || 0);
    const nextInr = inr > 0 ? roundMoney(inr * policy.factor, 'INR') : inr;
    const nextUsd = usd > 0 ? roundMoney(usd * policy.factor, 'USD') : usd;
    if (nextInr === inr && nextUsd === usd) continue;

    if (cardFrom >= policy.windowStart) {
      if (!DRY) {
        await col.updateOne({ _id: card._id }, {
          $set: {
            unitPriceINR: nextInr || undefined,
            unitPriceUSD: nextUsd || undefined,
            remarks: mark(card.remarks, policy),
            updatedAt: new Date(),
          },
        });
      }
      rateCards += 1;
      continue;
    }

    if (!DRY) {
      await col.updateOne({ _id: card._id }, {
        $set: { validTo: endOfPreviousDay(policy.windowStart), updatedAt: new Date() },
      });
      const { _id, ...copy } = card;
      await col.insertOne({
        ...copy,
        unitPriceINR: nextInr || copy.unitPriceINR,
        unitPriceUSD: nextUsd || copy.unitPriceUSD,
        validFrom: policy.windowStart,
        remarks: mark(card.remarks, policy),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    rateCards += 1;
  }

  for (const contract of contracts) {
    const policy = policyById.get(String(contract._id));
    if (!policy) continue;
    const ads = contract.adsEquipmentRules || [];
    let changed = false;
    const nextRules = ads.map((rule) => {
      if (alreadyMarked(rule.remarks, policy)) return rule;
      const inr = Number(rule.unitPriceINR || 0);
      const usd = Number(rule.unitPriceUSD || 0);
      if (!(inr > 0) && !(usd > 0)) return rule;
      changed = true;
      rules += 1;
      return {
        ...rule,
        unitPriceINR: inr > 0 ? roundMoney(inr * policy.factor, 'INR') : rule.unitPriceINR,
        unitPriceUSD: usd > 0 ? roundMoney(usd * policy.factor, 'USD') : rule.unitPriceUSD,
        remarks: mark(rule.remarks, policy),
      };
    });

    const volumes = contract.bhsVolumeSchedules || [];
    const nextVolumes = [];
    for (const schedule of volumes) {
      const note = `${schedule.note || ''} ${schedule.label || ''}`;
      const start = String(schedule.effectiveFrom || '');
      if (/escalat/i.test(note) || alreadyMarked(schedule.note, policy) || (start && start >= policy.windowYmd)) {
        nextVolumes.push(schedule);
        continue;
      }
      const bands = (schedule.bands || []).map((band) => ({
        ...band,
        unitPriceINR: band.unitPriceINR > 0
          ? roundMoney(band.unitPriceINR * policy.factor, 'INR')
          : band.unitPriceINR,
      }));
      const raised = {
        ...schedule,
        bands,
        effectiveFrom: policy.windowYmd,
        note: mark(schedule.note, policy),
      };
      if (!start) {
        nextVolumes.push({
          ...schedule,
          effectiveTo: ymd(endOfPreviousDay(policy.windowStart)),
        });
      } else if (start < policy.windowYmd) {
        nextVolumes.push({
          ...schedule,
          effectiveTo: ymd(endOfPreviousDay(policy.windowStart)),
        });
      }
      nextVolumes.push(raised);
      schedules += 1;
      changed = true;
    }

    const hasClause = (contract.clauses || []).some((clause) => clause.label === 'Current-year rates');
    const clauses = hasClause
      ? contract.clauses
      : [
        ...(contract.clauses || []),
        {
          clauseType: 'sgha',
          label: 'Current-year rates',
          body: `From ${policy.windowYmd} the saved annex rates increase by ${policy.percent}% a year for ${policy.steps} step(s), the increase in force on ${TODAY}. Earlier dates keep the previous rate.`,
          appliesTo: ['BHS', 'ADS'],
        },
      ];

    if (!DRY && (changed || !hasClause)) {
      await col.updateOne({ _id: contract._id }, {
        $set: {
          adsEquipmentRules: nextRules,
          ...(volumes.length > 0 ? { bhsVolumeSchedules: nextVolumes } : {}),
          clauses,
          updatedAt: new Date(),
        },
      });
    }
  }

  console.log(DRY ? 'DRY RUN' : 'APPLIED');
  console.log(`policies ${policies.length}`);
  console.log(`price cards ${priceCards}`);
  console.log(`rate cards ${rateCards}`);
  console.log(`ads rules ${rules}`);
  console.log(`volume schedules ${schedules}`);
  console.log(lines.join('\n'));
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
