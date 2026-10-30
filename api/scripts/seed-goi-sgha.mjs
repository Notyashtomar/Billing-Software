/**
 * Load Goa (GOI) SGHA rates from the signed annexes in api/data/GOA_SGHA.
 * Amounts are the figures printed in each annex. A yearly CPI clause is stored
 * as a clause; the rupee or dollar figure is not inflated.
 *
 * Usage (from api/): node --import ./scripts/register-exceljs.mjs is not required.
 *   node scripts/seed-goi-sgha.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'GOI';
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
const SU_NB = ['A320', 'A321', 'B737'];
const SU_WB = ['A330-200', 'A330-300', 'A350-900', 'B777-300'];
const GF_NB = ['A320', 'A320N', 'A321', 'A321N'];
const G9_AIRCRAFT = ['B737', 'A320', 'A321'];

const contracts = [
  {
    contractNumber: 'IX-GOI-SGHA',
    customerCode: 'IX',
    name: 'Air India Express',
    currency: 'INR',
    category: 'Both',
    aircraftTypes: IX_AIRCRAFT,
    from: '2025-01-01',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote:
      'Appendix I rates exclude airport concession, royalty, and GST. The annex does not print the concession percent.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 6,
      cancellationWithinHoursPercent: 50,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 50,
    },
    bhs: [
      { aircraft: IX_AIRCRAFT, category: 'Dom', price: 16102, remarks: 'Per flight turnaround. Printed rate Rs 16,102. From 1 Jan 2026 a CPI increase applies with a cap of 5%; the annex does not print the revised amount.' },
      { aircraft: IX_AIRCRAFT, category: 'Int', price: 19339, remarks: 'Per flight turnaround. Printed rate Rs 19,339. From 1 Jan 2026 a CPI increase applies with a cap of 5%; the annex does not print the revised amount.' },
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
      clause('1.1', 'Domestic turnaround A320/B737/B737 Max Rs 16,102 per flight. International turnaround Rs 19,339 per flight. Effective 1 January 2025 at Dabolim (GOI).'),
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
    contractNumber: 'G9-GOI-SGHA',
    customerCode: 'G9',
    name: 'Air Arabia',
    currency: 'USD',
    category: 'Both',
    aircraftTypes: G9_AIRCRAFT,
    from: '2022-06-29',
    to: FAR,
    openEnded: true,
    coverage: 'comprehensive',
    concessionNote: 'Prices include concession fees and royalties payable to the airport operator, and exclude service taxes and surcharges.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 24,
      cancellationWithinHoursPercent: 50,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 75,
    },
    bhs: [
      { aircraft: G9_AIRCRAFT, category: 'Int', price: 736, remarks: 'Code C turnaround or transit per flight, USD 736. A turnaround that mixes a domestic flight and an international flight is charged at the international rate.' },
      { aircraft: G9_AIRCRAFT, category: 'Dom', price: 736, remarks: 'Same printed Code C turnaround rate. A mixed domestic and international turnaround is charged once at the international rate.' },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 18, 'USD', 'Per Unit', { free: 5, remarks: 'Five wheelchairs included in basic handling. Additional WCHR or WCHS USD 18 per unit.' }),
      rule('Ambulift', 60, 'USD', 'Per Usage', {}),
      rule('Ground Power Unit', 215, 'USD', 'Per Turnaround', { free: 1, remarks: 'One GPU included. Charge USD 215 per turnaround. Unit column also says per hour or part thereof.' }),
      rule('Air Conditioner Unit', 259, 'USD', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Air Start Unit', 248, 'USD', 'Per Start', {}),
      rule('Towing', 388, 'USD', 'Per Tow', { remarks: 'Inter-stand tow.' }),
      rule('Push Back', 323, 'USD', 'Per Push', { remarks: 'Additional push.' }),
      rule('Pax Step Ladder', 141, 'USD', 'Per Hour', { remarks: 'Up to 2 step ladders for remote passenger-aircraft operations. USD 141 per hour or part thereof.' }),
      rule('Passenger Coach', 106, 'USD', 'Per Turnaround', {}),
      rule('Crew Coach', 47, 'USD', 'Per Turnaround', {}),
      rule('Disinfection', 66, 'USD', 'Per Turnaround', { remarks: 'Disinfection and deordising, per service, USD 66 per turnaround.' }),
      rule('Potable Water', 71, 'USD', 'Per Service', { free: 1, remarks: 'One water service included.' }),
      rule('Toilet Service', 65, 'USD', 'Per Service', { free: 1, remarks: 'One toilet service included.' }),
      rule('Cargo Supervision', 29, 'USD', 'Per Turnaround', { remarks: 'Section 5 cargo supervision, per turnaround or transit.' }),
      rule('Blue Collar', 21, 'USD', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('White Collar', 33, 'USD', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
    ],
    clauses: [
      clause('1.1.2', 'Basic handling for Code C (B737 / A320 / A321) is USD 736 per turnaround or transit flight. Effective 29 June 2022. The annex states a start date and no end date.'),
      clause('1.2', 'Prices include airport concession and royalty, and exclude service taxes and surcharges.'),
      clause('1.4', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.5', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.6', 'Return to ramp with a physical change of load is charged as a technical landing.'),
      clause('1.7', 'Ferry-in-live-out and live-in-ferry-out are 75%. A ferry flight with the aircraft empty and no ULD or loose cargo is not this case.'),
      clause('1.9', 'Cancellation within 24 hours is 50%.'),
      clause('1.12', 'Off schedule by more than four hours from STA/STD: additional 10% of the handling rate for every two hours of delay.'),
      clause('1.13', 'A turnaround that combines a domestic flight and an international flight is charged at the international rate only.'),
      clause('2.4', 'Rates increase each year by a maximum of 5%.'),
      clause('2.2', 'Up-line cancellation that needs handling or re-accommodation of passengers by the Handling Company is an additional 25% for those services.'),
      clause('2.6', 'Equipment for the basic handling service is limited to 3 hours. Beyond that, every 15 minutes or part is charged at the Handling Company local rate.'),
      clause('WCHC', 'The WCHC amount on the signed additional-services table is covered by another sentence and cannot be read. WCHR/WCHS is USD 18 with five wheelchairs included. No WCHC rate was saved.'),
    ],
  },
  {
    contractNumber: 'SU-GOI-SGHA',
    customerCode: 'SU',
    name: 'Aeroflot',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: [...SU_NB, ...SU_WB],
    from: '2026-09-29',
    to: '2028-09-30',
    openEnded: false,
    coverage: 'comprehensive',
    concessionNote: 'Basic handling rates include the current airport concession or royalty and exclude service taxes.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 12,
      cancellationWithinHoursPercent: 50,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 75,
    },
    bhs: [
      { aircraft: SU_NB, category: 'Int', price: 1285, remarks: 'Turnaround. Annex B2.0, 29 September 2026 to 30 September 2028. Inclusive of concession, exclusive of service tax.' },
      { aircraft: SU_WB, category: 'Int', price: 3050, remarks: 'Turnaround for A330-200, A330-300, A350-900 and B777-300.' },
    ],
    rules: [
      rule('Air Start Unit', 175, 'USD', 'Per Start', {}),
      rule('Ambulift', 165, 'USD', 'Per Service', {}),
      rule('Air Conditioner Unit', 200, 'USD', 'Per Hour', {}),
      rule('Ground Power Unit', 165, 'USD', 'Per Hour', {}),
      rule('Passenger Coach', 45, 'USD', 'Per Trip', { remarks: 'Apron transport, passenger.' }),
      rule('Blue Collar', 25, 'USD', 'Per Hour', { remarks: 'Per staff per hour.' }),
      rule('Crew Coach', 45, 'USD', 'Per Trip', {}),
      rule('Headset', 45, 'USD', 'Per Flight', { remarks: 'Ramp to flight-deck communication during pushback.' }),
      rule('Push Back', 159, 'USD', 'Per Push', { free: 1, aircraft: SU_NB, remarks: 'One narrow-body pushback is included in the turnaround rate. Additional push USD 159.' }),
      rule('Push Back', 220, 'USD', 'Per Push', { free: 1, aircraft: SU_WB, remarks: 'One wide-body pushback is included in the turnaround rate. Additional push USD 220.' }),
      rule('Toilet Service', 65, 'USD', 'Per Service', { free: 1, remarks: 'One toilet service included in the turnaround rate.' }),
      rule('Towing', 185, 'USD', 'Per Tow', { aircraft: SU_NB, remarks: 'Narrow-body tow.' }),
      rule('Towing', 275, 'USD', 'Per Tow', { aircraft: SU_WB, remarks: 'Wide-body tow.' }),
      rule('LD3', 10, 'USD', 'Per ULD Per Day', { free: 15, remarks: '15 closed LD3 per day of flight operation are included in the turnaround rate. Storage above that number, and any storage on non-operational days, is USD 10 per ULD per day.' }),
      rule('Unaccompanied Minor', 20, 'USD', 'Per Service', {}),
      rule('Wheel Chair - WCHR/S', 16, 'USD', 'Per Service', { free: 4, remarks: '4 WCHR included per turn. Additional WCHR USD 16.' }),
      rule('Wheel Chair-WCHC', 22, 'USD', 'Per Service', {}),
      rule('DCS', 412, 'USD', 'Per Flight', {}),
      rule('Flight Stationary', 80, 'USD', 'Per Flight', { remarks: 'Optional.' }),
      rule('Cargo Supervision', 166, 'USD', 'Per Flight', { aircraft: SU_NB, remarks: 'Excluding data-entry services. A320/A321/B737.' }),
      rule('Cargo Supervision Including Data Entry', 189, 'USD', 'Per Flight', { aircraft: SU_NB, remarks: 'A320/A321/B737.' }),
      rule('Cargo Acceptance', 126, 'USD', 'Per Flight', { aircraft: SU_NB, remarks: 'Sections 5.5.1 (a,b,c,d) and 5.6.4. A320/A321/B737.' }),
      rule('Cargo Supervision', 195, 'USD', 'Per Flight', { aircraft: SU_WB, remarks: 'Excluding data-entry services. Wide-body.' }),
      rule('Cargo Supervision Including Data Entry', 252, 'USD', 'Per Flight', { aircraft: SU_WB, remarks: 'Wide-body.' }),
      rule('Cargo Acceptance', 166, 'USD', 'Per Flight', { aircraft: SU_WB, remarks: 'Sections 5.5.1 (a,b,c,d) and 5.6.4. Wide-body.' }),
      rule('White Collar', 52, 'USD', 'Per Shift', { remarks: 'USD 52 per person per 8-hour shift and part thereof. This additional-staff table is inclusive of tax and concession.' }),
      rule('Utility Hand', 44, 'USD', 'Per Shift', { remarks: 'USD 44 per person per 8-hour shift and part thereof. Inclusive of tax and concession.' }),
      rule('Customs Coordination', 21, 'USD', 'Per 4 Hours', { remarks: 'Coordination staff with customs. USD 21 per 4 hours or part. Inclusive of tax and concession.' }),
      rule('DGR LAR VAL', 25, 'USD', 'Per Turnaround', { remarks: 'Section 5.5.1 (e). Inclusive of tax and concession.' }),
      rule('City-side Cargo Offload', 2, 'USD', 'Per 10 KG', { remarks: 'USD 2.0 per 10 kg. Inclusive of tax and concession.' }),
    ],
    clauses: [
      clause('Term', 'Annex B2.0 for Dabolim (GOI) is effective 29 September 2026 and valid till 30 September 2028. It replaces Annex B1.0 of 1 November 2022 and its addenda.'),
      clause('1.2', 'Basic handling rates include the current airport concession or royalty and exclude service taxes.'),
      clause('1.3', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.4', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.5', 'Return to ramp with a physical change of load is charged as a technical landing.'),
      clause('1.6', 'Ferry-in-live-out and live-in-ferry-out are 75%.'),
      clause('1.9', 'Cancellation within 12 hours is 50%. Notice must be by email to pk@basgoa.in.'),
      clause('1.10', 'Off schedule by more than four hours from STA/STD: additional 10% of the handling rate for every two hours of delay.'),
      clause('2.2', 'The rates in the second additional-services table (white collar, utility hand, delivery order, customs staff, DGR, city-side offload) include tax and concession.'),
      clause('2.4', 'The agreement stays fixed for 3 years, with an annual CPI increase of 6%.'),
      clause('3.1', 'Disbursements are at cost plus an accounting surcharge of 5%.'),
      clause('4.1', 'Liability limit per incident: USD 750,000 for A320/A321/B737, and USD 1,500,000 for A330-200/A330-300/A350-900/B777-300.'),
      clause('Standby', 'Equipment requested on standby and not used is charged at 50% of the additional-service rate.'),
      clause('Delivery order', 'Delivery-order collection is retained by the Handling Company. No separate rate is printed.'),
    ],
  },
  {
    contractNumber: 'QP-GOI-SGHA',
    customerCode: 'QP',
    name: 'Akasa Air',
    currency: 'INR',
    category: 'Dom',
    aircraftTypes: ['B737-8 MAX', 'B737 MAX 200'],
    from: '2022-06-01',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote:
      'Service tax and airport royalty or concession attributable to the carrier are payable by the carrier to the Handling Company in addition to the handling rate. The annex does not print one concession percent.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 30,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 60,
      lifoChargesPercent: 50,
      ronAdditionalPercent: 15,
    },
    bhs: [
      {
        aircraft: ['B737-8 MAX', 'B737 MAX 200'],
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
      rule('Passenger Coach', 1300, 'INR', 'Per Trip', { remarks: 'Per trip one way. Included in basic handling for remote operations at AMD, BLR, HYD, DEL, BOM and COK. Goa is not in that included list.' }),
      rule('Crew Coach', 115000, 'INR', 'Per Month', { remarks: 'Up to 3 passengers. Per month per car with maintenance and driver, except fuel, 24/7. Fuelling is done by the carrier. Printed as Rs 1,15,000.' }),
      rule('Crew Coach Driver', 30000, 'INR', 'Per Shift Per Month', { remarks: 'Per driver per shift per month.' }),
      rule('Waste Disposal', 300, 'INR', 'Per Service', {}),
      rule('Disinfection', 1400, 'INR', 'Per Service', {}),
      rule('Potable Water', 1100, 'INR', 'Per Service', { free: 1, remarks: 'One water service included.' }),
      rule('Toilet Service', 1100, 'INR', 'Per Service', { free: 1, remarks: 'One toilet service included.' }),
      rule('Blue Collar', 25000, 'INR', 'Per Shift Per Month', {}),
      rule('White Collar', 30000, 'INR', 'Per Shift Per Month', {}),
      rule('Night Halt Transit Cleaning', 2800, 'INR', 'Per Flight', { remarks: 'SOP up to 15 to 20 minutes. OEM specified disinfection chemicals to be supplied by the carrier. Printed Rs 2,800 per flight.' }),
      rule('Night Halt Deep Cleaning', 6200, 'INR', 'Per Flight', { remarks: 'SOP up to 60 minutes. OEM specified disinfection chemicals to be supplied by the carrier. Printed Rs 6,200 per flight.' }),
    ],
    clauses: [
      clause('Term', 'Draft Annex B1.0 for domestic operations at GOI, valid from 1 June 2022. The cover page calls it a draft. No end date is printed.'),
      clause('Option A', 'Pan-India per flight for B737 MAX 8 and B737 MAX 200: Ramp Rs 10,500, Terminal Rs 3,550, Load control Rs 1,000. Station management flat rate Rs 2,05,000 per month per station. The per-flight rate card is the sum of the three per-flight parts, Rs 15,050.'),
      clause('Option B', 'Non-exclusive volume rates per flight, plus station management per month. Up to 30 flights: Ramp 17,780, Terminal 6,500, Load control 1,250, station management 1,35,000. 31 to 60: 16,740 / 6,200 / 1,175 / 1,90,000. 61 to 90: 15,819 / 5,950 / 1,120 / 2,60,000. 91 to 120: 13,950 / 5,650 / 1,075 / 3,15,000. Above 120: 12,290 / 4,450 / 1,020 / station management tbd. Option B is not loaded as the per-flight rate card.'),
      clause('1.2', 'Service tax and airport royalty or concession attributable to the carrier are payable in addition.'),
      clause('1.3', 'If departures handled per day at an airport exceed ten, the parties will agree a reduction. Yearly increase is mutually agreed, capped at 5% for CPI.'),
      clause('1.5', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load. Ferry-in-live-out is 60%. Live-in-ferry-out is 50%. Night arrival with next-day departure is RON, plus 15%. RON includes two aircraft repositionings.'),
      clause('1.6', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.7', 'Return to ramp with a physical change of load is an additional 30% of the basic handling charge.'),
      clause('1.8', 'Off schedule beyond 75 minutes from STA/STD: additional 10% for the first hour and for every further hour, while services are offered. Ground time beyond scheduled ground time plus 45 minutes, for reasons attributable to the carrier: 10% per further hour.'),
      clause('1.10', 'Commercials apply to scheduled services only, not to special operations, charters, or related operations.'),
      clause('2.2.5', 'Excess baggage collection and ancillary revenue: the Handling Company retains 7% of the collection. No unit rate is printed.'),
      clause('IROP', 'Passenger transport and hotac in an IROP are actual cost plus 7% of actual cost.'),
      clause('2.2', 'Up-line cancellation that needs passenger handling or re-accommodation is an additional 15% of the terminal handling charges for those services.'),
    ],
  },
  {
    contractNumber: 'ZF-GOI-SGHA',
    customerCode: 'ZF',
    name: 'Azur Air',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: ['B757-200', 'B767-300'],
    from: '2022-11-01',
    to: '2028-10-31',
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote: 'Rates exclude concession. The concession payable to the airport operator is 15% on the gross basic rate. Government tax is extra.',
    concessionRates: { int: 15 },
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 12,
      cancellationWithinHoursPercent: 50,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 75,
    },
    bhs: [
      { aircraft: ['B757-200'], category: 'Int', price: 2150, remarks: 'Net basic turnaround rate. Excludes 15% concession on the gross basic rate. Yearly CPI of 7% is agreed; the annex does not print the compounded amount.' },
      { aircraft: ['B767-300'], category: 'Int', price: 3300, remarks: 'Net basic turnaround rate. Excludes 15% concession on the gross basic rate.' },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 12, 'USD', 'Per Unit', { free: 3, remarks: '3 wheelchairs per flight included. Additional WCHR or WCHS USD 12.' }),
      rule('Wheel Chair-WCHC', 18, 'USD', 'Per Unit', { remarks: 'The 3 included wheelchairs are WCHR/WCHS. WCHC is USD 18.' }),
      rule('Ambulift', 100, 'USD', 'Per Usage', {}),
      rule('Passenger Coach', 50, 'USD', 'Per Turnaround', {}),
      rule('Crew Coach', 0, 'USD', 'Per Turnaround', { remarks: 'Crew bus is FOC. No charge is printed.' }),
      rule('Ground Power Unit', 165, 'USD', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Air Conditioner Unit', 175, 'USD', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Air Start Unit', 175, 'USD', 'Per Start', {}),
      rule('Push Back', 175, 'USD', 'Per Push', { remarks: 'Additional pushback.' }),
      rule('Towing', 275, 'USD', 'Per Tow', { remarks: 'Inter-stand tow.' }),
      rule('Cargo Supervision', 250, 'USD', 'Per Flight', { remarks: 'Section 5 cargo supervision, administration and documentation.' }),
      rule('Utility Hand', 10, 'USD', 'Per Hour', { remarks: 'Additional porter or utility hand, per staff per hour.' }),
      rule('DCS', 250, 'USD', 'Per Flight', {}),
      rule('CUTE', 1.45, 'USD', 'Per Passenger', {}),
      rule('Blue Collar', 10, 'USD', 'Per Hour', { remarks: 'Additional blue collar.' }),
      rule('White Collar', 18, 'USD', 'Per Hour', { remarks: 'Additional white collar.' }),
      rule('General Cargo Handling', 0.1, 'USD', 'Per KG', { remarks: 'Warehouse to aircraft and back. Minimum USD 250 per flight.' }),
      rule('Special Cargo Handling', 0.15, 'USD', 'Per KG', { remarks: 'Live animals, perishable and similar. Minimum USD 25 per service.' }),
      rule('ULD Handling', 6, 'USD', 'Per ULD Per Day', {}),
      rule('Headset', 35, 'USD', 'Per Service', { remarks: 'Addendum No. 1 effective 1 October 2024. Ramp to flight deck during pushback, tow-in and engine start. Excludes concession and attracts tax.' }),
    ],
    clauses: [
      clause('Term', 'Annex B for Dabolim is valid from 1 November 2022 to 31 October 2025 and renews automatically for the same period unless either party gives 60 days written notice. Minar Travels (India) Pvt. Ltd. is the carrier representative in India, not a separate billed airline.'),
      clause('Concession', 'The net basic rate excludes concession. Concession payable to the airport operator is 15% on the gross basic rate. Government tax applies.'),
      clause('CPI', 'Rates are subject to a yearly CPI increase of 7%. The annex prints the net basic rate and does not print later compounded amounts.'),
      clause('ULD storage', 'Storage for 12 LD3s per month is included when the carrier operates at least 5 flights per week. A lower frequency, and any storage above 12 LD3s, is chargeable. The annex does not print that storage price apart from ULD handling at USD 6 per day per ULD.'),
      clause('1.1', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.2', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.3', 'Return to ramp with a physical change of load is charged as a technical landing.'),
      clause('1.4', 'Transit, ferry-in-live-out and live-in-ferry-out are 75% when ground time matches a scheduled flight. Extended ground time is pro rata.'),
      clause('1.7', 'Cancellation within 12 hours is 50%.'),
      clause('1.8', 'Off schedule by more than four hours from STA/STD: additional 10% of the handling rate for every two hours of delay.'),
      clause('Addendum', 'Addendum No. 1 effective 1 October 2024 adds headset at USD 35. It excludes concession and attracts tax.'),
      clause('Crew bus', 'Crew bus is printed as FOC. No unit price was saved for it.'),
    ],
  },
  {
    contractNumber: 'GF-GOI-SGHA',
    customerCode: 'GF',
    name: 'Gulf Air',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: [...GF_NB, 'B787'],
    from: '2024-03-27',
    to: '2029-03-26',
    openEnded: false,
    coverage: 'comprehensive',
    concessionNote:
      'Clause 1.2 says the Annex B rates include airport concession and royalty and exclude service tax. A pricing-structure sentence on the same annex says prices exclude a 15% concession and 18% GST. The loaded rates follow clause 1.2 and are not grossed up again. Both sentences are stored in the clauses.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 12,
      cancellationWithinHoursPercent: 50,
      filoLifoChargesPercent: 70,
    },
    bhs: gulfBhs(),
    rules: [
      rule('VIP UMNR', 10, 'USD', 'Per Passenger', {}),
      rule('Wheel Chair - WCHR/S', 10, 'USD', 'Per Unit', { free: 6, remarks: '6 WCHR/WCHS included in basic handling. Additional WCHR or WCHS USD 10.' }),
      rule('Wheel Chair-WCHC', 12, 'USD', 'Per Unit', {}),
      rule('Ambulift', 92, 'USD', 'Per Usage', {}),
      rule('Ground Power Unit', 90, 'USD', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Air Conditioner Unit', 110, 'USD', 'Per Hour', { remarks: 'Per hour or part thereof.' }),
      rule('Headset', 55, 'USD', 'Per Flight', {}),
      rule('Air Start Unit', 105, 'USD', 'Per Start', {}),
      rule('Push Back', 98, 'USD', 'Per Push', { remarks: 'Additional pushback.' }),
      rule('Towing', 105, 'USD', 'Per Tow', { remarks: 'Inter-stand tow.' }),
      rule('Utility Hand', 14, 'USD', 'Per Hour', { remarks: 'Additional porter or utility hand, per staff per hour.' }),
      rule('Cargo Supervision', 75, 'USD', 'Per Flight', { remarks: 'Section 5 cargo supervision, administration and documentation. Delivery-order charges are retained by the Handling Company.' }),
      rule('Cargo Acceptance', 12, 'USD', 'Per Hour', { remarks: 'Per staff per hour.' }),
    ],
    clauses: [
      clause('Term', 'Annex B1.0 for Goa International Airport (GOI), effective 27 March 2024. Year 1 of the handling table is treated as 27 March 2024 to 26 March 2025, and each later year starts on 27 March.'),
      clause('1.1.2', 'Narrow-body (A320, A320N, A321, A321N) USD by year: 685, 700, 744, 790, 839. B787 USD by year: 1,853, 1,938, 2,055, 2,180. Year 5 for the B787 is blank in the annex and was not saved.'),
      clause('1.2', 'Clause 1.2: rates include concession fees and royalties payable to the airport authority. Service taxes are exclusive.'),
      clause('Pricing structure', 'A sentence above the rate table says the prices exclude a concession fee of 15% payable to the airport operator and 18% GST. The royalty line also prints 15% for ground handling services charged through the airport authority. The rate card follows clause 1.2 (inclusive) so the 15% is not added a second time.'),
      clause('1.3', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.4', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.5', 'Return to ramp with a physical change of load is charged as a technical landing.'),
      clause('1.6', 'Ferry-in-live-out and live-in-ferry-out are 70% when the aircraft is not completely empty.'),
      clause('1.9', 'Cancellation within 12 hours is 50%. Cancellation within 6 hours is 100%.'),
      clause('2.4', 'Rates increase automatically each year by 5% for CPI. The year-by-year table is the loaded schedule.'),
      clause('2.2', 'Extensive delay of more than 2 hours, or a cancelled service with partial or full download, is an additional 10% when the Handling Company personnel perform the service. Up-line cancellation needing passenger handling or re-accommodation is an additional 25% for those services.'),
      clause('3.1', 'Disbursements are at cost plus an accounting surcharge of 5%.'),
      clause('Cargo', 'Cargo and mail handling, courier handling and X-ray screening are NIL. Ramp transportation is included in the ground handling charge. Section 5 is outside the ground-handling licence; the handler provides supporting staff only.'),
      clause('ULD', '10 passenger ULDs for wide-body operations are included in basic handling.'),
      clause('BME', 'BME charges are recharged at cost.'),
      clause('Excess baggage', 'Excess baggage collection: 5% commission is retained. No unit rate is printed.'),
      clause('Load control', 'Load control and communication charge provided by the airport authority is NIL.'),
    ],
  },
];

function gulfBhs() {
  const years = [
    ['2024-03-27', '2025-03-26', 685, 1853, 1],
    ['2025-03-27', '2026-03-26', 700, 1938, 2],
    ['2026-03-27', '2027-03-26', 744, 2055, 3],
    ['2027-03-27', '2028-03-26', 790, 2180, 4],
    ['2028-03-27', '2029-03-26', 839, null, 5],
  ];
  const rows = [];
  for (const [from, to, nb, wb, year] of years) {
    rows.push({
      aircraft: GF_NB,
      category: 'Int',
      price: nb,
      from,
      to,
      remarks: `Handling rate for year ${year}. A320, A320N, A321 and A321N are the same printed amount. Inclusive of concession under clause 1.2.`,
    });
    if (wb != null) {
      rows.push({
        aircraft: ['B787'],
        category: 'Int',
        price: wb,
        from,
        to,
        remarks: `Handling rate for year ${year}. Inclusive of concession under clause 1.2.`,
      });
    }
  }
  return rows;
}

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
    ...(item.concessionRates ? { concessionRates: item.concessionRates } : {}),
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
    await billing.updateOne(
      { _id: existing._id, stationCode: STATION },
      { $set: contractFields },
    );
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
    const from = pkg.from ?? item.from;
    const to = pkg.to ?? item.to;
    for (const aircraftType of pkg.aircraft) {
      for (const handlingType of ['BHS', 'ADS']) {
        await billing.insertOne({
          docType: 'price_card_airline',
          handlingType,
          customerCode: item.customerCode,
          airlineName: item.name,
          validFrom: day(from),
          validTo: day(to, true),
          remarks: `GOA SGHA. ${pkg.remarks}`,
          aircraftType,
          category: pkg.category,
          ...(handlingType === 'BHS' ? { price: pkg.price } : {}),
          currencyCode: item.currency,
          openEnded: item.openEnded && !pkg.from,
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
    from: item.from,
    to: item.openEnded ? 'open' : item.to,
  });
}

console.log(JSON.stringify({ station: STATION, summary }, null, 2));
await client.close();
