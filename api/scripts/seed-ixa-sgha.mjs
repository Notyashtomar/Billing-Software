/**
 * Load Agartala (IXA) SGHA rates from api/data/IXA_SGHA.
 * Amounts are the figures printed in each annex. CPI is stored as a clause.
 *
 * Usage (from api/): node scripts/seed-ixa-sgha.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'IXA';
const FAR = '2099-12-31';

function day(iso, end = false) {
  return new Date(`${iso}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
}

function rule(serviceCode, amount, currency, uom, extra = {}) {
  const row = {
    serviceCode,
    includedForAds: true,
    alwaysChargeable: extra.free == null || extra.free === 0,
    uom,
    aircraftTypes: extra.aircraft ?? [],
    remarks: extra.remarks ?? '',
  };
  if (extra.free != null) row.freePerFlight = extra.free;
  if (extra.free != null && extra.free > 0) row.alwaysChargeable = false;
  if (currency === 'USD') row.unitPriceUSD = amount;
  else row.unitPriceINR = amount;
  if (extra.category) row.category = extra.category;
  return row;
}

function clause(label, body, appliesTo = ['BHS', 'ADS']) {
  return { clauseType: 'sgha', label, body, appliesTo };
}

const IX_AIRCRAFT = ['A320', 'B737', 'B737-8 MAX'];
const QP_AIRCRAFT = ['B737-8', 'B737-8200', 'B737-8 MAX'];

const contracts = [
  {
    contractNumber: 'IX-IXA-SGHA',
    customerCode: 'IX',
    name: 'Air India Express',
    currency: 'INR',
    category: 'Dom',
    aircraftTypes: IX_AIRCRAFT,
    from: '2025-01-01',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote:
      'Appendix I and Appendix V rates exclude airport concession, royalty, and GST. The annex does not print the concession percent. The international turnaround cell is blank.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 6,
      cancellationWithinHoursPercent: 50,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 50,
    },
    bhs: [
      {
        aircraft: IX_AIRCRAFT,
        category: 'Dom',
        price: 17762,
        remarks:
          'Per flight turnaround. Printed rate Rs 17,762. The international row in the same table is a dash and has no rate. From 1 Jan 2026 a CPI increase applies with a cap of 5%; the annex does not print the revised amount.',
      },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 480, 'INR', 'Per Unit', {
        free: 5,
        remarks:
          '5 WCHR/WCHS/WCHC services included per flight, counted on a cumulative monthly basis. The allowance is one shared pool. Additional units Rs 480.',
      }),
      rule('Wheel Chair-WCHC', 600, 'INR', 'Per Unit', {
        free: 5,
        remarks:
          'Shares the same 5 WCHR/WCHS/WCHC allowance per flight on a cumulative monthly basis. Additional WCHC Rs 600.',
      }),
      rule('Ambulift', 5800, 'INR', 'Per Usage', { remarks: 'Per unit per use.' }),
      rule('Ground Power Unit', 2100, 'INR', 'Per Half Hour', { remarks: 'Per half hour or part thereof.' }),
      rule('Air Conditioner Unit', 3800, 'INR', 'Per Half Hour', { remarks: 'Per half hour or part thereof.' }),
      rule('Air Start Unit', 5500, 'INR', 'Per Start', {}),
      rule('Towing', 6500, 'INR', 'Per Tow', { remarks: 'Interstand short tow.' }),
      rule('Push Back', 4900, 'INR', 'Per Push', {
        free: 1,
        remarks: 'One pushback included in basic handling. Additional push Rs 4,900.',
      }),
      rule('Potable Water', 2000, 'INR', 'Per Service', {
        free: 1,
        remarks: 'One water service included. Additional service Rs 2,000.',
      }),
      rule('Toilet Service', 1800, 'INR', 'Per Service', {
        free: 1,
        remarks: 'One toilet service included. Additional service Rs 1,800.',
      }),
      rule('Blue Collar', 300, 'INR', 'Per Hour', { remarks: 'Per hour or part thereof. No free allowance.' }),
      rule('Pax Step Ladder', 2400, 'INR', 'Per Hour', {
        free: 1,
        remarks:
          'Included: 2 passenger steps for remote operations, or 1 step at an aerobridge, or 1 rear step when refuelling and boarding run together, for a maximum of 90 minutes. Additional time Rs 2,400 per unit per hour or part.',
      }),
    ],
    clauses: [
      clause('1.1', 'Domestic turnaround A320/B737/B737 Max Rs 17,762 per flight. The international turnaround cell is blank, so no international handling rate was saved. Effective 1 January 2025 at Agartala (IXA).'),
      clause('1.2.1', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.2.3', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.2.4', 'Return to ramp with a physical change of load limited to disembarkation of passengers and crew is 50% of the basic handling rate.'),
      clause('1.2.6', 'An aircraft on ground that departs later and needs a second check-in is charged an additional 50%.'),
      clause('1.2.7', 'Ferry-out flights are 50% of the handling charge.'),
      clause('1.2.8', 'Diversion flights are charged the Paragraph 1.1 rate. The same diversion rate applies at every location where the Handling Company operates.'),
      clause('1.2.9', '10% additional when ATA/ATD exceeds STA/STD by six hours.'),
      clause('1.2.10', 'Cancellation notice not received within six hours of STA is charged at 50%.'),
      clause('1.3', 'Printed rates stay fixed for one year from 1 January 2025. From 1 January 2026 the annual increase follows the government CPI and is capped at 5% for that year. The annex does not print the increased amount.'),
      clause('1.4', 'GST, airport concession or royalty, and any other authority fee are extra and are shown separately on the invoice.'),
      clause('ADS', 'Additional-service rates are exclusive of airport concession, government tax, and royalty.'),
      clause('WCHR', 'Five wheelchair services (WCHR, WCHS and WCHC together) are included per flight on a cumulative monthly basis.'),
    ],
  },
  {
    contractNumber: 'QP-IXA-SGHA',
    customerCode: 'QP',
    name: 'Akasa Air',
    currency: 'INR',
    category: 'Both',
    aircraftTypes: QP_AIRCRAFT,
    from: '2025-06-01',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote:
      'Rates are exclusive of airport royalty or concession and applicable taxes, payable by the carrier to the Handling Company on actuals. The annex does not print one concession percent.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      cancellationWithinHours: 4,
      cancellationWithinHoursPercent: 50,
      filoLifoChargesPercent: 60,
      lifoChargesPercent: 50,
      ronAdditionalPercent: 15,
      splitIntArrivalDomDeparturePercent: 20,
      splitDomArrivalIntDeparturePercent: 25,
    },
    bhs: [
      {
        aircraft: QP_AIRCRAFT,
        category: 'Dom',
        price: 19660,
        remarks:
          'Comprehensive handling for 1 to 200 domestic flights in the month. B737-8 and B737-8200. Maximum ground time 75 minutes. Ramp handling for the same band is Rs 14,694. Higher volume bands are in the contract clauses and are not substituted automatically.',
      },
      {
        aircraft: QP_AIRCRAFT,
        category: 'Int',
        price: 23100,
        remarks:
          'Comprehensive handling for 1 to 150 international flights in the month. Ramp handling for the same band is Rs 17,850. Higher volume bands are in the contract clauses.',
      },
    ],
    rules: [
      rule('Unaccompanied Minor', 282, 'INR', 'Per Service', { category: 'Dom' }),
      rule('Unaccompanied Minor', 420, 'INR', 'Per Service', { category: 'Int' }),
      rule('Wheel Chair - WCHR/S', 361, 'INR', 'Per Unit', {
        free: 6,
        category: 'Dom',
        remarks: '6 WCHR/S included in comprehensive domestic handling.',
      }),
      rule('Wheel Chair - WCHR/S', 473, 'INR', 'Per Unit', {
        free: 4,
        category: 'Int',
        remarks: '4 WCHR/S included in comprehensive international handling.',
      }),
      rule('Wheel Chair-WCHC', 424, 'INR', 'Per Unit', { category: 'Dom' }),
      rule('Wheel Chair-WCHC', 525, 'INR', 'Per Unit', { category: 'Int' }),
      rule('MAAS', 1500, 'INR', 'Per Passenger', { category: 'Dom' }),
      rule('MAAS', 2700, 'INR', 'Per Passenger', { category: 'Int' }),
      rule('Ambulift', 4408, 'INR', 'Per Usage', { remarks: 'Stretcher case. Per unit per use. Same rate for domestic and international.' }),
      rule('Wheelchair Lift', 958, 'INR', 'Per Lift', {}),
      rule('Ticketing Staff', 33907, 'INR', 'Per Shift Per Month', { remarks: 'Per staff per shift per month. Space provided by the carrier.' }),
      rule('Ground Power Unit', 2500, 'INR', 'Per Hour', { category: 'Dom', remarks: 'Passenger-operation GPU. Per hour or part thereof.' }),
      rule('Ground Power Unit', 3938, 'INR', 'Per Hour', { category: 'Int', remarks: 'Passenger-operation GPU. Per hour or part thereof.' }),
      rule('Air Conditioner Unit', 2150, 'INR', 'Per 30 Minutes', { remarks: 'Per 30 minutes or part thereof.' }),
      rule('Air Start Unit', 5261, 'INR', 'Per Start', {}),
      rule('Headset', 3500, 'INR', 'Per Service', {}),
      rule('Towing', 6584, 'INR', 'Per Tow', {}),
      rule('Push Back', 4881, 'INR', 'Per Push', { free: 1, remarks: 'One pushback is included in comprehensive handling. Additional push Rs 4,881.' }),
      rule('Passenger Coach', 1470, 'INR', 'Per Trip', { remarks: 'Passenger transport for aerobridge or contact bay, one way, on request by the carrier.' }),
      rule('Split Terminal Transport', 5513, 'INR', 'Per Flight', { remarks: 'Passenger transport for split operations using different terminals only.' }),
      rule('Crew Staff Transport', 710, 'INR', 'Per Trip', { remarks: 'Crew or staff transport, all inclusive, one way.' }),
      rule('Waste Disposal', 339, 'INR', 'Per Service', {}),
      rule('Flight Deck Cleaning', 2500, 'INR', 'Per Service', {}),
      rule('Disinfection', 1582, 'INR', 'Per Service', { remarks: 'Disinfection and deodorize.' }),
      rule('Transit Cargo Hold Cleaning', 2500, 'INR', 'Per Service', { remarks: 'For 45 minutes.' }),
      rule('Deep Cargo Hold Cleaning', 9500, 'INR', 'Per Service', { remarks: 'For 5 hours.' }),
      rule('Potable Water', 1244, 'INR', 'Per Service', { free: 1, remarks: 'One water service included in comprehensive handling.' }),
      rule('Toilet Service', 1244, 'INR', 'Per Service', { free: 1, remarks: 'One toilet service included in comprehensive handling.' }),
      rule('Blue Collar', 162, 'INR', 'Per Hour', {
        remarks: 'Hourly staff only. A 7-day shift is Rs 28,256 per staff per shift per month, multiplied by 1.62. A 5-day shift uses the same Rs 28,256 multiplied by 1.08. The monthly figure is not an extra charge on top of the hourly rate.',
      }),
      rule('White Collar', 194, 'INR', 'Per Hour', {
        remarks: 'Hourly staff only. A 7-day shift is Rs 33,907 per staff per shift per month, multiplied by 1.62. A 5-day shift uses the same Rs 33,907 multiplied by 1.08.',
      }),
      rule('Extended Cleaning', 4672, 'INR', 'Per Flight', { remarks: 'OEM disinfection chemicals supplied by the carrier.' }),
      rule('Deep Cleaning', 10345, 'INR', 'Per Flight', { remarks: 'OEM disinfection chemicals supplied by the carrier.' }),
      rule('BFL Diesel', 31422, 'INR', 'Per Month', { remarks: 'Dedicated and all inclusive, except fuel, which is on actuals, 24/7.' }),
      rule('Dedicated Diesel Vehicle', 253244, 'INR', 'Per Month', { remarks: 'Petrol, diesel or CNG vehicle taken from 1 June 2025. Per month per car, including maintenance and driver, except fuel. Not added on top of the electric vehicle rate.' }),
      rule('Dedicated Electric Vehicle', 254980, 'INR', 'Per Month', { remarks: 'Electric vehicle taken from 1 June 2025. Per month per car, including maintenance and driver, except power. Not added on top of the diesel vehicle rate.' }),
      rule('Canter', 353000, 'INR', 'Per Month', { remarks: 'Monthly canter for baggage transfers. Includes maintenance and driver. Fuel on actuals.' }),
      rule('Cargo Trolley Pickup', 1350, 'INR', 'Per Trip', { remarks: 'Additional pickup of export cargo and delivery of import cargo to or from the aircraft. Maximum 3 baggage trolleys. Does not apply to airlines operating from WFS.' }),
      rule('Courier Trolley Pickup', 1350, 'INR', 'Per Trip', { remarks: 'Pickup of export courier and delivery of import courier between the aircraft and DHL or EICI terminals. Maximum 3 baggage trolleys.' }),
      rule('Tractor', 66231, 'INR', 'Per Shift Per Month', { remarks: 'Appendix 2 engineering. Inclusive of fuel.' }),
      rule('Electric Tug', 90418, 'INR', 'Per Shift Per Month', { remarks: 'Appendix 2 engineering.' }),
      rule('Engineering Step Ladder', 31646, 'INR', 'Per Shift', { remarks: 'Non-motorized. Per month per night shift for 8 hours.' }),
      rule('Engineering Trip', 710, 'INR', 'Per Trip', { remarks: 'Engineering, ramp or electric vehicle, all inclusive, one way.' }),
      rule('PBB Docking', 1353, 'INR', 'Per Service', { remarks: 'Wherever applicable.' }),
      rule('Dedicated Diesel Tug', 295000, 'INR', 'Per Month', { remarks: 'Per month per tug with maintenance and driver. Fuel on actuals.' }),
      rule('Dedicated Electric Tug', 270000, 'INR', 'Per Month', { remarks: 'Per month per tug with maintenance and driver. Power at the electric-vehicle power charge.' }),
    ],
    clauses: [
      clause('Term', 'Annex B1.1 for Maharaja Bir Bikram Airport (IXA), effective 1 June 2025. Aircraft are B737-8 and B737-8200. One turnaround is arrival and the subsequent departure of the same aircraft, with a maximum ground time of 75 minutes.'),
      clause('Comprehensive domestic', 'Comprehensive handling per flight, domestic: 1 to 200 flights Rs 19,660; 201 to 300 Rs 19,070; 301 and above Rs 18,677. The rate card holds the 1 to 200 rate. The annex prices the whole month at the band for that month\'s flight count. The billing engine does not switch the whole month to a lower band, so the higher bands stay in this clause.'),
      clause('Ramp domestic', 'Ramp handling per flight, domestic: 1 to 200 Rs 14,694; 201 to 300 Rs 14,253; 301 and above Rs 13,959. Ramp is not loaded as the turnaround rate card.'),
      clause('Comprehensive international', 'Comprehensive handling per flight, international: 1 to 150 flights Rs 23,100; 151 to 250 Rs 22,407; 251 and above Rs 21,945. The rate card holds the 1 to 150 rate.'),
      clause('Ramp international', 'Ramp handling per flight, international: 1 to 150 Rs 17,850; 151 to 250 Rs 17,315; 251 and above Rs 16,958.'),
      clause('Charter', 'Charter domestic is Rs 26,500 comprehensive and Rs 21,000 ramp per flight. Charter international is Rs 38,889 comprehensive and Rs 31,115 ramp per flight. Charter is not the scheduled rate card.'),
      clause('Split', 'International arrival and domestic departure is 20% over the domestic handling charge. Domestic arrival and international departure is 25% over the international handling charge. On a split, the departure sector\'s airport concession applies, and the departure sector\'s service scope applies.'),
      clause('Included', 'Comprehensive handling includes 6 WCHR/S on domestic and 4 WCHR/S on international, wing-walkers, 1 pushback, 1 interior transit cleaning, 1 toilet service and 1 water service.'),
      clause('1.4', 'Technical landing or a diverted flight for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.5', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.6', 'Return to ramp with a physical change of load is an additional 30% of the handling charge. This is not stored as a 30% replacement of the handling rate.'),
      clause('1.7', 'Ferry-in live-out is 60%. Live-in ferry-out is 50%.'),
      clause('1.8', 'RON is an arrival between 22:00 and 04:00 that departs on or before 06:00, with ground time of at least 75 minutes. RON is an additional 15% and includes one repositioning. A ground time under 75 minutes is not RON. Other ground-time charges are not added on top of RON.'),
      clause('1.9', 'Arrival more than 75 minutes after STA is an additional 10%, unless the carrier informed the Handling Company of the change or delay in writing before the original STA, or the delay is attributable to the Handling Company.'),
      clause('1.10', 'Ground time beyond 75 minutes is an additional 20% for domestic and 25% for international.'),
      clause('1.11', 'A swap flight, meaning a change of aircraft after activities under the wings have commenced, is an additional 20%.'),
      clause('1.12', 'Cancellation is 50% unless the carrier gives notice at least 4 hours before STA.'),
      clause('1.13', 'No extra charge for night, weekend or legal-holiday services.'),
      clause('1.14', 'Rates stay fixed for one year from 1 June 2025. After that they increase by 4.5% a year for CPI. The annex does not print the increased amount.'),
      clause('2.2.5', 'Excess baggage and ancillary revenue for comprehensive handling: the Handling Company retains 7% of the collection. No unit rate is printed.'),
      clause('IROP', 'Passenger transport and hotel accommodation in an IROP are actual cost plus 7%.'),
      clause('Manpower', 'Blue collar: Rs 28,256 per staff per shift per month. Seven-day cover is that amount times 1.62. Five-day cover is that amount times 1.08. Hourly staff are Rs 162 and the monthly formula does not apply. White collar: Rs 33,907 per staff per shift per month, times 1.62 for seven days and times 1.08 for five days. Hourly staff are Rs 194.'),
      clause('Vehicles', 'A dedicated petrol, diesel or CNG vehicle taken from 1 June 2025 is Rs 2,53,244 per month. A dedicated electric vehicle is Rs 2,54,980 per month. These are alternatives. Existing crew vehicles already provided to the carrier were Rs 2,05,000 per month only until 31 May 2026. Fuel is on actuals. Disbursement is not added on fuel.'),
      clause('Engineering GPU', 'Appendix 2 engineering GPU is Rs 8,477 for the first 4 hours and Rs 2,120 per hour or part after that. A dedicated engineering GPU is Rs 16,953 per 9 hours of usage. These are not the passenger-operation GPU rates of Rs 2,500 domestic and Rs 3,938 international per hour.'),
      clause('Engineering power', 'Power charge for an electric vehicle is Rs 22,604 per month per vehicle. Disbursement is not added. A driver or equipment operator, where applicable, is Rs 33,907 per month per shift: seven-day cover is staff times 1.62 times 33,907, and five-day cover is staff times 1.08 times 33,907.'),
      clause('ADS notes', 'Additional-service rates attract concession and tax. They include the operator, parking, fuel and maintenance unless the line says otherwise. Fuel marked on actuals is on actuals only, with no disbursement.'),
    ],
  },
];

function stripZeroPrice(rules) {
  return rules.filter((row) => (row.unitPriceINR ?? 0) > 0 || (row.unitPriceUSD ?? 0) > 0);
}

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();
const summary = [];

for (const item of contracts) {
  const rules = stripZeroPrice(item.rules);
  const existingCustomer = await billing.findOne({
    docType: 'customer',
    stationCode: STATION,
    customerCode: item.customerCode,
  });
  if (!existingCustomer) {
    await billing.insertOne({
      docType: 'customer',
      customerCode: item.customerCode,
      name: item.name,
      airlineInvoiceName: item.name,
      currencyCode: item.currency,
      stationCode: STATION,
      priceCardHandlingTypes: ['BHS', 'ADS'],
      blocked: false,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await billing.updateOne(
      { _id: existingCustomer._id, stationCode: STATION },
      {
        $set: {
          currencyCode: item.currency,
          priceCardHandlingTypes: ['BHS', 'ADS'],
          active: true,
          blocked: false,
          updatedAt: now,
          ...(existingCustomer.name ? {} : { name: item.name }),
        },
      },
    );
  }

  const contractFields = {
    customerCode: item.customerCode,
    stationCode: STATION,
    category: item.category,
    categories: item.category === 'Both' ? ['Dom', 'Int'] : [item.category],
    aircraftTypes: item.aircraftTypes,
    priceValidFrom: day(item.from),
    priceValidTo: day(item.to, true),
    openEnded: item.openEnded,
    status: 'active',
    adsBillingEnabled: true,
    bhsConcessionCoverage: item.coverage,
    bhsConcessionNote: item.concessionNote,
    conditionalCharges: item.conditional,
    clauses: item.clauses,
    adsEquipmentRules: rules,
    updatedAt: now,
  };
  const existing = await billing.findOne({
    docType: 'contract',
    stationCode: STATION,
    contractNumber: item.contractNumber,
  });
  if (existing) {
    await billing.updateOne({ _id: existing._id, stationCode: STATION }, { $set: contractFields });
  } else {
    await billing.insertOne({
      docType: 'contract',
      contractNumber: item.contractNumber,
      createdAt: now,
      ...contractFields,
    });
  }

  await billing.updateMany(
    {
      docType: 'price_card_airline',
      stationCode: STATION,
      customerCode: item.customerCode,
      handlingType: { $in: ['BHS', 'ADS'] },
    },
    { $set: { active: false, updatedAt: now } },
  );

  let bhsCount = 0;
  for (const pkg of item.bhs) {
    for (const aircraftType of pkg.aircraft) {
      for (const handlingType of ['BHS', 'ADS']) {
        await billing.insertOne({
          docType: 'price_card_airline',
          handlingType,
          customerCode: item.customerCode,
          airlineName: item.name,
          validFrom: day(item.from),
          validTo: day(item.to, true),
          remarks: `IXA SGHA. ${pkg.remarks}`,
          aircraftType,
          category: pkg.category,
          ...(handlingType === 'BHS' ? { price: pkg.price } : {}),
          currencyCode: item.currency,
          openEnded: item.openEnded,
          flightOperation: 'scheduled',
          stationCode: STATION,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      bhsCount += 1;
    }
  }
  summary.push({
    contract: item.contractNumber,
    rules: rules.length,
    bhsCards: bhsCount,
  });
}

console.log(JSON.stringify({ station: STATION, summary }, null, 2));
await client.close();
