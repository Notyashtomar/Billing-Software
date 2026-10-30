/**
 * Load Imphal (IMF) SGHA rates from api/data/IMF_SGHA.
 * Amounts are the figures printed in each annex. A yearly increase is a clause.
 *
 * Usage (from api/): node scripts/seed-imf-sgha.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'IMF';
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
const I5_AIRCRAFT = ['A319', 'A320', 'A321'];
const QP_AIRCRAFT = ['B737-8 MAX', 'B737 MAX 200'];

const contracts = [
  {
    contractNumber: 'IX-IMF-SGHA',
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
        price: 15687,
        remarks:
          'Per flight turnaround. Printed rate Rs 15,687. The international row is a dash and has no rate. From 1 Jan 2026 a CPI increase applies with a cap of 5%; the annex does not print the revised amount.',
      },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 480, 'INR', 'Per Unit', {
        free: 5,
        remarks: '5 WCHR/WCHS/WCHC services included per flight, counted on a cumulative monthly basis. The allowance is one shared pool. Additional units Rs 480.',
      }),
      rule('Wheel Chair-WCHC', 600, 'INR', 'Per Unit', {
        free: 5,
        remarks: 'Shares the same 5 WCHR/WCHS/WCHC allowance per flight on a cumulative monthly basis. Additional WCHC Rs 600.',
      }),
      rule('Ambulift', 5800, 'INR', 'Per Usage', { remarks: 'Per unit per use.' }),
      rule('Ground Power Unit', 2100, 'INR', 'Per Half Hour', { remarks: 'Per half hour or part thereof.' }),
      rule('Air Conditioner Unit', 3800, 'INR', 'Per Half Hour', { remarks: 'Per half hour or part thereof.' }),
      rule('Air Start Unit', 5500, 'INR', 'Per Start', {}),
      rule('Towing', 6500, 'INR', 'Per Tow', { remarks: 'Interstand short tow.' }),
      rule('Push Back', 4900, 'INR', 'Per Push', { free: 1, remarks: 'One pushback included in basic handling. Additional push Rs 4,900.' }),
      rule('Potable Water', 2000, 'INR', 'Per Service', { free: 1, remarks: 'One water service included. Additional service Rs 2,000.' }),
      rule('Toilet Service', 1800, 'INR', 'Per Service', { free: 1, remarks: 'One toilet service included. Additional service Rs 1,800.' }),
      rule('Blue Collar', 300, 'INR', 'Per Hour', { remarks: 'Per hour or part thereof. No free allowance.' }),
      rule('Pax Step Ladder', 2400, 'INR', 'Per Hour', {
        free: 1,
        remarks: 'Included: 2 passenger steps for remote operations, or 1 step at an aerobridge, or 1 rear step when refuelling and boarding run together, for a maximum of 90 minutes. Additional time Rs 2,400 per unit per hour or part.',
      }),
    ],
    clauses: [
      clause('1.1', 'Domestic turnaround A320/B737/B737 Max Rs 15,687 per flight. The international turnaround cell is blank, so no international handling rate was saved. Effective 1 January 2025 at Imphal (IMF).'),
      clause('1.2.1', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.2.3', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.2.4', 'Return to ramp with a physical change of load limited to disembarkation of passengers and crew is 50% of the basic handling rate.'),
      clause('1.2.6', 'An aircraft on ground that departs later and needs a second check-in is charged an additional 50%.'),
      clause('1.2.7', 'Ferry-out flights are 50% of the handling charge.'),
      clause('1.2.8', 'Diversion flights are charged the Paragraph 1.1 rate.'),
      clause('1.2.9', '10% additional when ATA/ATD exceeds STA/STD by six hours.'),
      clause('1.2.10', 'Cancellation notice not received within six hours of STA is charged at 50%.'),
      clause('1.3', 'Printed rates stay fixed for one year from 1 January 2025. From 1 January 2026 the annual increase follows the government CPI and is capped at 5%. The annex does not print the increased amount.'),
      clause('ADS', 'Additional-service rates are exclusive of airport concession, government tax, and royalty.'),
      clause('WCHR', 'Five wheelchair services (WCHR, WCHS and WCHC together) are included per flight on a cumulative monthly basis.'),
    ],
  },
  {
    contractNumber: 'QP-IMF-SGHA',
    customerCode: 'QP',
    name: 'Akasa Air',
    currency: 'INR',
    category: 'Dom',
    aircraftTypes: QP_AIRCRAFT,
    from: '2022-06-01',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote:
      'Service tax and airport royalty or concession attributable to the carrier are payable by the carrier to the Handling Company in addition. The annex does not print one concession percent. The cover page titles this a draft and prints the location as IXM; the address is Imphal and the station code used here is IMF.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 60,
      lifoChargesPercent: 50,
      ronAdditionalPercent: 15,
    },
    bhs: [
      {
        aircraft: QP_AIRCRAFT,
        category: 'Dom',
        price: 15050,
        remarks: 'Option A pan-India per flight: Ramp Rs 10,500 + Terminal Rs 3,550 + Load control Rs 1,000. Station management Rs 2,05,000 per month per station is not part of this per-flight rate. The cover page titles the annex as a draft for domestic operations.',
      },
    ],
    rules: [
      rule('Unaccompanied Minor', 250, 'INR', 'Per Service', {}),
      rule('Wheel Chair - WCHR/S', 350, 'INR', 'Per Unit', { free: 6, remarks: '6 wheelchairs included for the terminal services package.' }),
      rule('Wheel Chair-WCHC', 400, 'INR', 'Per Unit', {}),
      rule('Ambulift', 3900, 'INR', 'Per Usage', { remarks: 'Stretcher case. Per unit per use.' }),
      rule('Ticketing Staff', 30000, 'INR', 'Per Shift Per Month', { remarks: 'Per staff per shift per month. Space provided by the carrier.' }),
      rule('Ground Power Unit', 4200, 'INR', 'Per Turnaround', { free: 1, remarks: 'One GPU included. Additional charge Rs 4,200 per scheduled turnaround.' }),
      rule('Air Conditioner Unit', 3805, 'INR', 'Per Turnaround', { remarks: 'Per scheduled turnaround.' }),
      rule('Air Start Unit', 4655, 'INR', 'Per Start', {}),
      rule('Towing', 5825, 'INR', 'Per Tow', {}),
      rule('Push Back', 4319, 'INR', 'Per Push', { remarks: 'Additional push.' }),
      rule('Passenger Coach', 1300, 'INR', 'Per Trip', { remarks: 'Per trip one way. Included in basic handling for remote operations at AMD, BLR, HYD, DEL, BOM and COK. Imphal is not in that included list.' }),
      rule('Crew Coach', 115000, 'INR', 'Per Month', { remarks: 'Up to 3 passengers. Per month per car with maintenance and driver, except fuel, 24/7. Fuelling is done by the carrier. Printed as Rs 1,15,000.' }),
      rule('Crew Coach Driver', 30000, 'INR', 'Per Shift Per Month', { remarks: 'Per driver per shift per month.' }),
      rule('Waste Disposal', 300, 'INR', 'Per Service', {}),
      rule('Disinfection', 1400, 'INR', 'Per Service', {}),
      rule('Potable Water', 1100, 'INR', 'Per Service', { free: 1, remarks: 'One water service included.' }),
      rule('Toilet Service', 1100, 'INR', 'Per Service', { free: 1, remarks: 'One toilet service included.' }),
      rule('Blue Collar', 25000, 'INR', 'Per Shift Per Month', {}),
      rule('White Collar', 30000, 'INR', 'Per Shift Per Month', {}),
      rule('Night Halt Transit Cleaning', 2800, 'INR', 'Per Flight', { remarks: 'SOP up to 15 to 20 minutes. OEM disinfection chemicals supplied by the carrier.' }),
      rule('Night Halt Deep Cleaning', 6200, 'INR', 'Per Flight', { remarks: 'SOP up to 60 minutes. OEM disinfection chemicals supplied by the carrier.' }),
    ],
    clauses: [
      clause('Term', 'Draft Annex B1.0 for domestic operations, valid from 1 June 2022. The cover prints the location as IXM. The office address is Imphal International Airport, and this contract is stored on station IMF. No end date is printed.'),
      clause('Option A', 'Pan-India per flight for B737 MAX 8 and B737 MAX 200: Ramp Rs 10,500, Terminal Rs 3,550, Load control Rs 1,000. Station management Rs 2,05,000 per month per station. The per-flight rate card is Rs 15,050.'),
      clause('Option B', 'Non-exclusive volume rates per flight, plus station management per month. Up to 30: Ramp 17,780, Terminal 6,500, Load control 1,250, station management 1,35,000. 31 to 60: 16,740 / 6,200 / 1,175 / 1,90,000. 61 to 90: 15,819 / 5,950 / 1,120 / 2,60,000. 91 to 120: 13,950 / 5,650 / 1,075 / 3,15,000. Above 120: 12,290 / 4,450 / 1,020 / station management tbd. Option B is not loaded as the per-flight rate card.'),
      clause('1.5', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load. Ferry-in-live-out is 60%. Live-in-ferry-out is 50%. Night arrival with next-day departure is RON, plus 15%. RON includes two aircraft repositionings.'),
      clause('1.6', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.7', 'Return to ramp with a physical change of load is an additional 30% of the basic handling charge.'),
      clause('1.8', 'Off schedule beyond 75 minutes from STA/STD: additional 10% for the first hour and for every further hour, while services are offered. Ground time beyond scheduled ground time plus 45 minutes, for reasons attributable to the carrier: 10% per further hour.'),
      clause('1.10', 'Commercials apply to scheduled services only, not to special operations or charters.'),
      clause('1.3', 'Yearly increase is mutually agreed and capped at 5% for CPI. The annex does not print a revised amount.'),
      clause('2.2.5', 'Excess baggage collection and ancillary revenue: the Handling Company retains 7% of the collection.'),
      clause('IROP', 'Passenger transport and hotac in an IROP are actual cost plus 7% of actual cost.'),
      clause('2.2', 'Up-line cancellation that needs passenger handling or re-accommodation is an additional 15% of the terminal handling charges for those services.'),
    ],
  },
  {
    contractNumber: 'SG-IMF-SGHA',
    customerCode: 'SG',
    name: 'SpiceJet',
    currency: 'INR',
    category: 'Dom',
    aircraftTypes: ['B737'],
    from: '2026-02-10',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote: 'Ramp handling charges are exclusive of concession fees and royalties payable to the airport operator, and exclusive of applicable taxes.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 12,
      cancellationWithinHoursPercent: 50,
      delayChargesPercent: 10,
    },
    bhs: [
      {
        aircraft: ['B737'],
        category: 'Dom',
        price: 31500,
        remarks: 'Ramp services only, not comprehensive handling. Rate for up to 40 domestic B737 flights in the month. The 41 to 55 band is Rs 21,750 and above 55 is Rs 17,250. Those bands are on the contract and are not substituted automatically.',
      },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 550, 'INR', 'Per Unit', { free: 4, remarks: '4 WCHR/WCHS included per flight. Additional WCHR or WCHS Rs 550.' }),
      rule('Wheel Chair-WCHC', 600, 'INR', 'Per Unit', { remarks: 'WCHC is Rs 600. The four included chairs are WCHR/WCHS.' }),
      rule('Ground Power Unit', 4000, 'INR', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Air Conditioner Unit', 6500, 'INR', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Passenger Coach', 850, 'INR', 'Per Trip', { free: 1, remarks: 'The coach used for the aircraft turnaround is included. Rs 850 per trip applies when transport is used apart from that turnaround.' }),
      rule('Crew Coach', 850, 'INR', 'Per Trip', { free: 1, remarks: 'One crew-bus service is free at arrival or departure. Additional trip Rs 850.' }),
      rule('Air Start Unit', 7500, 'INR', 'Per Start', {}),
      rule('Push Back', 5800, 'INR', 'Per Push', { remarks: 'Additional pushback.' }),
      rule('Towing', 8000, 'INR', 'Per Tow', { remarks: 'Inter-stand tow.' }),
      rule('Toilet Service', 2250, 'INR', 'Per Service', { free: 1, remarks: 'One toilet service included in the turnaround rate.' }),
      rule('Potable Water', 2250, 'INR', 'Per Service', { free: 1, remarks: 'One water service included in basic handling.' }),
      rule('Utility Hand', 220, 'INR', 'Per Hour', { remarks: 'Additional porter or utility hand, per staff per hour.' }),
      rule('White Collar', 270, 'INR', 'Per Hour', { remarks: 'Additional white collar, per staff per hour.' }),
    ],
    clauses: [
      clause('Term', 'Annex B1.0 for Imphal International Airport, effective 10 February 2026. No end date is printed. The handling in paragraph 1.1.2 is ramp services only.'),
      clause('Volume', 'Domestic B737 ramp rate per flight: up to 40 flights in the month Rs 31,500; 41 to 55 flights Rs 21,750; above 55 flights Rs 17,250. The rate card holds Rs 31,500. The annex prices the month by the band for that month\'s flight count.'),
      clause('1.4', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.5', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.6', 'Return to ramp with a physical change of load is charged as a technical landing.'),
      clause('1.8', 'Cancellation within 12 hours is 50%.'),
      clause('1.10', 'Off schedule by more than 3 hours from STA/STD is an additional 10%.'),
      clause('2.3', 'Rates increase by 5% on every anniversary. The annex does not print the increased amount.'),
      clause('3.1', 'Disbursements are at cost plus an accounting surcharge of 10%.'),
      clause('4.1', 'Liability limit for the B737 is USD 1,000,000 per incident.'),
      clause('Standby', 'Ground support equipment requested on standby and not used is charged at 50% of the additional-service rate.'),
      clause('ADS', 'Additional-service rates are exclusive of tax and of the airport concession fee.'),
    ],
  },
  {
    contractNumber: 'I5-IMF-SGHA',
    customerCode: 'I5',
    name: 'AIX Connect',
    currency: 'INR',
    category: 'Both',
    aircraftTypes: I5_AIRCRAFT,
    from: '2023-04-16',
    to: '2028-04-15',
    openEnded: false,
    coverage: 'non_comprehensive',
    concessionNote: 'The comprehensive handling charge does not include GST or the concession fee payable to the airport operator. Check-in counters, CUTE, boarding passes and baggage tags are also extra.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 50,
    },
    bhs: [
      { aircraft: I5_AIRCRAFT, category: 'Dom', price: 17750, remarks: 'Comprehensive turnaround. One printed rate for A319, A320 and A321. Year-on-year increase of 5% is agreed and is not compounded into this amount.' },
      { aircraft: I5_AIRCRAFT, category: 'Int', price: 17750, remarks: 'The annex prints one turnaround rate and does not split domestic and international.' },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 450, 'INR', 'Per Unit', { free: 6, remarks: 'Six wheelchair services included in basic handling. The annex prices WCHR and WCHC at the same Rs 450 and the six are one shared pool.' }),
      rule('Wheel Chair-WCHC', 450, 'INR', 'Per Unit', { free: 6, remarks: 'Shares the six included wheelchair services with WCHR/WCHS. Additional WCHC Rs 450.' }),
      rule('Ambulift', 9500, 'INR', 'Per Service', {}),
      rule('Ground Power Unit', 5500, 'INR', 'Per Hour', { remarks: 'Same rate for a base flight and a turnaround flight. Per hour or part thereof.' }),
      rule('Air Conditioner Unit', 7500, 'INR', 'Per Hour', { remarks: 'Cooling unit. Per hour or part thereof.' }),
      rule('Passenger Coach', 1040, 'INR', 'Per Trip', { free: 1, remarks: 'One trip included on an aerobridge flight and two trips included on a remote-bay flight. Additional one-way trip Rs 1,040.' }),
      rule('Crew Coach', 900, 'INR', 'Per Turnaround', { free: 1, remarks: 'One trip included on an aerobridge flight and two trips included on a remote-bay flight. Additional turnaround Rs 900.' }),
      rule('Air Start Unit', 5500, 'INR', 'Per Start', {}),
      rule('Push Back', 4200, 'INR', 'Per Service', { free: 1, remarks: 'One pushback or tow is included in basic handling. Additional service Rs 4,200. The allowance is one service, not one push and one tow.' }),
      rule('Towing', 4200, 'INR', 'Per Service', { free: 1, remarks: 'Shares the one included pushback or tow. Additional service Rs 4,200.' }),
      rule('Basic Cabin Cleaning', 2800, 'INR', 'Per Service', { remarks: 'Transit interior cleaning is included in the basic handling charge and is not this line.' }),
      rule('Toilet Service', 1100, 'INR', 'Per Service', { free: 1, remarks: 'One toilet service included.' }),
      rule('Potable Water', 1100, 'INR', 'Per Service', { free: 1, remarks: 'One water service included.' }),
      rule('Utility Hand', 16900, 'INR', 'Per Shift Per Month', { remarks: 'Per month per staff, shift up to 8 hours. Porter for office housekeeping and utility hands for counter and x-ray assistance.' }),
      rule('Passenger Services Staff', 22600, 'INR', 'Per Shift Per Month', { remarks: 'Per month per staff, shift up to 8 hours.' }),
      rule('Trestle', 1100, 'INR', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Pax Step Ladder', 3200, 'INR', 'Per Service', { free: 2, remarks: 'Two step ladders for 60 minutes are included in the basic handling charge. Additional service Rs 3,200.' }),
      rule('VIP', 850, 'INR', 'Per Service', {}),
      rule('Cargo City Side Loading', 100, 'INR', 'Per 10 KG', {}),
      rule('Cargo Holding Trolley', 250, 'INR', 'Per Hour', { free: 1, remarks: 'One hour free. Rs 250 per additional hour.' }),
    ],
    clauses: [
      clause('Term', 'Annex B1.0 for Imphal (IMF) with AIX Connect Private Limited, formerly AirAsia (India) Private Limited. Effective 16 April 2023 for five years, until 15 April 2028, unless ended earlier on the notice in paragraph 7.'),
      clause('1.1', 'Comprehensive handling for A319, A320 and A321 is Rs 17,750 per turnaround. Check-in counters, CUTE, boarding passes, baggage tags, GST and airport concession are extra.'),
      clause('1.2.1', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.2.2', 'Return to ramp with a physical change of load is 50%.'),
      clause('1.2.4', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.2.6', 'Ferry-in and ferry-out are 50%.'),
      clause('1.2.7', 'Off schedule by more than two hours from STA/STD: additional 10% of the handling rate for every two hours of delay.'),
      clause('1.2.8', '5% additional when ATA, ATD or actual ground time exceeds STA, STD or scheduled ground time by one hour.'),
      clause('1.2.11', 'Cancellation notice received in time, meaning at least the scheduled flying time between origin and destination, has no cancellation charge. Otherwise: notice by STA minus 4 hours is 15%; STA minus 2 hours is 25%; STA minus 1 hour is 40%; at STA is 50%.'),
      clause('7.2', 'Prices increase year on year by 5%, and the increase in a year is not more than 5%. The annex does not print the increased amount.'),
      clause('ADS', 'Additional-service rates exclude airport concession, GST and other taxes. Transit interior cleaning is included in the basic handling charge. Six wheelchair services are included.'),
      clause('6.3', 'Late payment interest is 1% per month after 30 days from receipt of an undisputed invoice.'),
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
          remarks: `IMF SGHA. ${pkg.remarks}`,
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
  summary.push({ contract: item.contractNumber, rules: rules.length, bhsCards: bhsCount });
}

console.log(JSON.stringify({ station: STATION, summary }, null, 2));
await client.close();
