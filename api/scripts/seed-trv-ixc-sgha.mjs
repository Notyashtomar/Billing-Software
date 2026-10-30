/**
 * Load Thiruvananthapuram (TRV) and Chandigarh (IXC) SGHA rates.
 * Every contract, customer, and rate card is stamped with that station code.
 *
 * Usage (from api/): node scripts/seed-trv-ixc-sgha.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const FAR = '2099-12-31';
const IX_AIR = ['A319', 'A320', 'A321', 'B737', 'B737-8 MAX'];
const NB = ['A319', 'A320', 'A321'];
const UL_WB = ['A330', 'A350'];
const EY_WB = ['B787-9', 'B787-10', 'B777-300', 'B777-300ER', 'A350', 'A380', 'B777F'];

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
  return row;
}
function clause(label, body, appliesTo = ['BHS', 'ADS']) {
  return { clauseType: 'sgha', label, body, appliesTo };
}

function airArabiaAds() {
  return [
    rule('Wheel Chair - WCHR/S', 17, 'USD', 'Per Unit', { free: 3, remarks: '3 WCHR, WCHS or WCHC included per flight, not carried to the next flight. Additional WCHR or WCHS USD 17. The allowance is one shared pool with WCHC.' }),
    rule('Wheel Chair-WCHC', 20, 'USD', 'Per Unit', { free: 3, remarks: 'Shares the 3 included wheelchairs. Additional WCHC USD 20.' }),
    rule('Ambulift', 167, 'USD', 'Per Usage', { remarks: 'Stretcher case.' }),
    rule('Wheelchair Lift', 55, 'USD', 'Per Usage', {}),
    rule('Ground Power Unit', 197, 'USD', 'Per Turnaround', { remarks: 'Unit column also says per hour or part thereof.' }),
    rule('Air Conditioner Unit', 190, 'USD', 'Per Hour', {}),
    rule('Air Start Unit', 226, 'USD', 'Per Start', {}),
    rule('Towing', 266, 'USD', 'Per Tow', {}),
    rule('Push Back', 295, 'USD', 'Per Push', { remarks: 'Additional push.' }),
    rule('Pax Step Ladder', 129, 'USD', 'Per Hour', {}),
    rule('Passenger Coach', 97, 'USD', 'Per Turnaround', {}),
    rule('Crew Coach', 43, 'USD', 'Per Turnaround', {}),
    rule('Potable Water', 65, 'USD', 'Per Service', { free: 1 }),
    rule('Toilet Service', 59, 'USD', 'Per Service', { free: 1 }),
    rule('Cargo Supervision', 40, 'USD', 'Per Turnaround', {}),
    rule('Blue Collar', 18, 'USD', 'Per Hour', {}),
    rule('White Collar', 28, 'USD', 'Per Hour', {}),
  ];
}

const contracts = [
  {
    station: 'IXC',
    contractNumber: 'IX-IXC-SGHA',
    customerCode: 'IX',
    name: 'Air India Express',
    currency: 'INR',
    category: 'Both',
    aircraftTypes: IX_AIR,
    from: '2025-09-01',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote: 'Rates exclude airport concession, royalty, and GST. The annex does not print the concession percent.',
    conditional: { technicalHandlingChargesPercent: 50, returnToRamp: 0, cancellationWithinHours: 6, cancellationWithinHoursPercent: 50, delayChargesPercent: 10, filoLifoChargesPercent: 50 },
    bhs: [
      { aircraft: IX_AIR, category: 'Dom', price: 17762, remarks: 'Per flight turnaround at IXC. Printed Rs 17,762.' },
      { aircraft: IX_AIR, category: 'Int', price: 20000, remarks: 'Per flight turnaround at IXC. Printed Rs 20,000.' },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 480, 'INR', 'Per Unit', { free: 5, remarks: '5 WCHR/WCHS/WCHC included per flight on a cumulative monthly basis. Additional WCHR or WCHS Rs 480.' }),
      rule('Wheel Chair-WCHC', 600, 'INR', 'Per Unit', { free: 5, remarks: 'Shares the same 5-chair allowance. Additional WCHC Rs 600.' }),
      rule('Ambulift', 5800, 'INR', 'Per Usage', {}),
      rule('Ground Power Unit', 2100, 'INR', 'Per Half Hour', {}),
      rule('Air Conditioner Unit', 3800, 'INR', 'Per Half Hour', {}),
      rule('Air Start Unit', 5500, 'INR', 'Per Start', {}),
      rule('Towing', 6500, 'INR', 'Per Tow', {}),
      rule('Push Back', 4900, 'INR', 'Per Push', { free: 1, remarks: 'One pushback included.' }),
      rule('Potable Water', 2000, 'INR', 'Per Service', { free: 1 }),
      rule('Toilet Service', 1800, 'INR', 'Per Service', { free: 1 }),
      rule('Blue Collar', 300, 'INR', 'Per Hour', {}),
      rule('Pax Step Ladder', 2400, 'INR', 'Per Hour', { free: 1, remarks: 'Included: 2 remote steps, or 1 aerobridge step, or 1 rear step while refuelling and boarding together, for up to 90 minutes.' }),
    ],
    clauses: [
      clause('Term', 'Shaheed Bhagat Singh International Airport (IXC), effective 1 September 2025. Rates stay fixed for one year. From 1 September 2026 the CPI increase is capped at 5%. The annex does not print the increased amount.'),
      clause('1.1', 'Domestic turnaround Rs 17,762. International turnaround Rs 20,000. Aircraft: A319, A320, A321, B737 and B737 Max.'),
      clause('1.2', 'Return to ramp is not charged extra when there is no physical change of load. A change of load limited to disembarkation is 50%. Technical landing for a non-commercial purpose is 50%. Ferry-out is 50%. A second check-in after an aircraft-on-ground is an additional 50%.'),
      clause('1.2.9', '10% additional when ATA/ATD exceeds STA/STD by six hours. Cancellation notice not received within six hours of STA is 50%.'),
      clause('ADS', 'Additional services exclude airport concession, government tax, and royalty.'),
    ],
  },
  {
    station: 'TRV',
    contractNumber: '3L-TRV-SGHA',
    customerCode: '3L',
    name: 'Air Arabia Abu Dhabi',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: ['A320', 'A321'],
    from: '2024-09-11',
    to: '2027-09-10',
    openEnded: false,
    coverage: 'comprehensive',
    concessionNote: 'Basic handling includes airport concession and royalty, and excludes service tax. Additional services exclude concession and tax.',
    conditional: { technicalHandlingChargesPercent: 50, returnToRamp: 0, cancellationWithinHours: 24, cancellationWithinHoursPercent: 50, delayChargesPercent: 10, filoLifoChargesPercent: 75 },
    bhs: [{ aircraft: ['A320', 'A321'], category: 'Int', price: 1000, remarks: 'Turnaround or transit per flight at TRV. Includes concession.' }],
    rules: airArabiaAds(),
    clauses: [
      clause('Term', 'Thiruvananthapuram (TRV), effective 11 September 2024. Basic and additional rates stay fixed for three years, until 10 September 2027.'),
      clause('1.4', 'Technical landing is 50% when there is no physical change of load. Return to ramp without a change of load is not charged extra. A change of load is charged as a technical landing.'),
      clause('1.6', 'Ferry-in-live-out and live-in-ferry-out are 75% when the aircraft is empty.'),
      clause('1.8', 'Cancellation within 24 hours is 50%.'),
      clause('1.10', 'Off schedule by more than 4 hours: 10% of the handling rate for every two hours of delay.'),
      clause('2.3', 'Up-line cancellation that needs passenger handling is an additional 25% for those services.'),
      clause('Stationery', 'Departure stationery, boarding passes and baggage tags, is complimentary.'),
    ],
  },
  {
    station: 'TRV',
    contractNumber: 'G9-TRV-SGHA',
    customerCode: 'G9',
    name: 'Air Arabia',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: ['A320', 'A321'],
    from: '2024-09-11',
    to: '2027-09-10',
    openEnded: false,
    coverage: 'comprehensive',
    concessionNote: 'Basic handling includes airport concession and royalty, and excludes service tax. Additional services exclude concession and tax. This is the Sharjah Air Arabia contract, separate from Air Arabia Abu Dhabi.',
    conditional: { technicalHandlingChargesPercent: 50, returnToRamp: 0, cancellationWithinHours: 24, cancellationWithinHoursPercent: 50, delayChargesPercent: 10, filoLifoChargesPercent: 75 },
    bhs: [{ aircraft: ['A320', 'A321'], category: 'Int', price: 1000, remarks: 'Turnaround or transit per flight at TRV. Includes concession.' }],
    rules: airArabiaAds(),
    clauses: [
      clause('Term', 'Thiruvananthapuram (TRV) for Air Arabia PJSC, Sharjah, effective 11 September 2024. Rates stay fixed for three years, until 10 September 2027.'),
      clause('1.4', 'Technical landing is 50% when there is no physical change of load. Return to ramp without a change of load is not charged extra.'),
      clause('1.6', 'Empty ferry flights are 75%.'),
      clause('1.8', 'Cancellation within 24 hours is 50%.'),
      clause('1.10', 'Off schedule by more than 4 hours: 10% for every two hours of delay.'),
    ],
  },
  {
    station: 'TRV',
    contractNumber: 'AK-TRV-SGHA',
    customerCode: 'AK',
    name: 'AirAsia Berhad',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: ['A320', 'A321'],
    from: '2024-02-15',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote: 'Prices exclude airport concession or royalty, and exclude GST. The annex does not print the concession percent.',
    conditional: { technicalHandlingChargesPercent: 50, returnToRamp: 0, cancellationWithinHours: 12, cancellationWithinHoursPercent: 50, delayChargesPercent: 10, filoLifoChargesPercent: 75 },
    bhs: [{ aircraft: ['A320', 'A321'], category: 'Int', price: 950, remarks: 'Turnaround. The printed rate applies from 15 February 2024. From 15 February 2025 it increases 6% a year. The increased amount is not printed and was not calculated.' }],
    rules: [
      rule('Wheel Chair - WCHR/S', 12, 'USD', 'Per Unit', { free: 5 }),
      rule('Wheel Chair-WCHC', 16, 'USD', 'Per Unit', {}),
      rule('Ambulift', 165, 'USD', 'Per Usage', {}),
      rule('Ground Power Unit', 125, 'USD', 'Per Hour', {}),
      rule('Air Conditioner Unit', 145, 'USD', 'Per Hour', {}),
      rule('Air Start Unit', 145, 'USD', 'Per Start', {}),
      rule('Towing', 180, 'USD', 'Per Tow', {}),
      rule('Push Back', 145, 'USD', 'Per Push', {}),
      rule('Pax Step Ladder', 65, 'USD', 'Per Hour', { remarks: 'Up to 2 for remote operations.' }),
      rule('Passenger Coach', 150, 'USD', 'Per Turnaround', { remarks: 'Remote bay.' }),
      rule('Crew Coach', 45, 'USD', 'Per Turnaround', { remarks: 'Remote bay.' }),
      rule('Disinfection', 45, 'USD', 'Per Service', {}),
      rule('Potable Water', 45, 'USD', 'Per Service', { free: 1 }),
      rule('Toilet Service', 45, 'USD', 'Per Service', { free: 1 }),
      rule('Blue Collar', 18, 'USD', 'Per Hour', {}),
      rule('White Collar', 24, 'USD', 'Per Hour', {}),
    ],
    clauses: [
      clause('Term', 'Thiruvananthapuram (TRV), 15 February 2024 until 14 February 2025 at the printed rate, then 6% a year. The 6% increase was not applied to the saved USD 950.'),
      clause('1.4', 'Technical landing is 50% when there is no physical change of load. Return to ramp without a change of load is not charged extra. A change of load is charged as a technical landing.'),
      clause('1.6', 'Empty ferry flights are 75%.'),
      clause('1.8', 'Cancellation within 12 hours is 50%.'),
      clause('1.10', 'A delay not caused by the handler is 10% beyond 2 hours and 20% beyond 4 hours.'),
      clause('Excess baggage', '10% commission when the carrier staff do not collect it.'),
      clause('3.1', 'Disbursements are at cost plus 10%, with original receipts.'),
    ],
  },
  {
    station: 'TRV',
    contractNumber: 'EY-TRV-SGHA',
    customerCode: 'EY',
    name: 'Etihad Airways',
    currency: 'INR',
    category: 'Int',
    aircraftTypes: ['A320', 'A321', ...EY_WB],
    from: '2024-01-01',
    to: '2026-12-31',
    openEnded: false,
    coverage: 'non_comprehensive',
    concessionNote: 'The annex prices comprehensive handling in INR and says pricing is also uploaded in Ariba. It does not print a concession percent on this page.',
    conditional: { technicalHandlingChargesPercent: 50 },
    bhs: [
      { aircraft: ['A320', 'A321'], category: 'Int', price: 96986, remarks: 'Comprehensive per turnaround. Guest services Rs 43,643, ramp Rs 72,739, cabin clean only Rs 14,548. Based on 30 monthly one-way flights.' },
      { aircraft: ['B787-9', 'B787-10', 'B777-300', 'B777-300ER', 'A350', 'A380'], category: 'Int', price: 193971, remarks: 'Comprehensive per turnaround. Guest services Rs 87,287, ramp Rs 1,45,478, cabin clean only Rs 29,096.' },
      { aircraft: ['B777F'], category: 'Int', price: 126090, remarks: 'Comprehensive per turnaround. Guest, ramp and cabin columns are blank for the freighter.' },
    ],
    rules: [
      rule('Unaccompanied Minor', 995, 'INR', 'Per Guest', {}),
      rule('Wheel Chair - WCHR/S', 1082, 'INR', 'Per Guest', { free: 8, aircraft: ['A320', 'A321'], remarks: '8 PRMs included on a narrow-body flight.' }),
      rule('Wheel Chair - WCHR/S', 1082, 'INR', 'Per Guest', { free: 15, aircraft: EY_WB, remarks: '15 PRMs included on a wide-body flight.' }),
      rule('VIP', 995, 'INR', 'Per Guest', {}),
      rule('Deportee', 995, 'INR', 'Per Guest', {}),
      rule('Ambulift', 13981, 'INR', 'Per Service', { remarks: 'Stretcher case.' }),
      rule('Wheelchair Lift', 1894, 'INR', 'Per Flight', {}),
      rule('Ground Power Unit-90KV', 9922, 'INR', 'Per 90 Minutes', { remarks: '90 KVA, only during BME failure or at a remote bay.' }),
      rule('Ground Power Unit-180KV', 3900, 'INR', 'Per 15 Minutes', { remarks: '180 KVA.' }),
      rule('Air Conditioner Unit', 3900, 'INR', 'Per 15 Minutes', { remarks: 'Small unit, 1 hose.' }),
      rule('Air Conditioner Unit Large', 4900, 'INR', 'Per 15 Minutes', { remarks: 'Large unit, 2 hoses.' }),
      rule('Air Start Unit', 8118, 'INR', 'Per Service', {}),
      rule('Cabin Cleaning Communicable', 5232, 'INR', 'Per Service', { remarks: 'Additional cabin cleaning for communicable diseases, section 8 of the carrier CAM.' }),
      rule('Pax Step Ladder', 8028, 'INR', 'Per Hour', { remarks: 'Only when used beyond scheduled ground time.' }),
      rule('Towing', 14883, 'INR', 'Per Tow', { remarks: 'Inter-stand tow.' }),
      rule('Push Back', 10824, 'INR', 'Per Push', { remarks: 'Additional push.' }),
      rule('Toilet Service', 8569, 'INR', 'Per Service', { free: 1 }),
      rule('Potable Water', 5863, 'INR', 'Per Service', { free: 1 }),
    ],
    clauses: [
      clause('Term', 'Thiruvananthapuram (TRV), 1 January 2024 to 31 December 2026.'),
      clause('1.3', 'Rates assume 30 monthly one-way flights. If frequency rises, the discount on all flights is 5% for 0 to 10 extra flights, 10% for 11 to 20, 15% for 21 to 30, and 20% for 31 or more. The discount is not applied on the rate card.'),
      clause('1.4', 'Technical landing for a non-commercial purpose is 50%.'),
      clause('Split', 'Guest services, ramp, and cabin-clean-only amounts are in the rate-card remarks. The saved price is the comprehensive turnaround.'),
    ],
  },
  {
    station: 'TRV',
    contractNumber: 'GF-TRV-SGHA',
    customerCode: 'GF',
    name: 'Gulf Air',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: ['A320', 'A320N', 'A321', 'A321N', 'B787-9'],
    from: '2023-09-15',
    to: FAR,
    openEnded: true,
    coverage: 'non_comprehensive',
    concessionNote: 'Prices exclude the current airport concession or royalty, and exclude GST.',
    conditional: { technicalHandlingChargesPercent: 50, returnToRamp: 0, cancellationWithinHours: 12, cancellationWithinHoursPercent: 50, delayChargesPercent: 10 },
    bhs: [
      { aircraft: ['A320', 'A320N', 'A321', 'A321N'], category: 'Int', price: 1240, remarks: 'Turnaround per flight at TRV.' },
      { aircraft: ['B787-9'], category: 'Int', price: 2375, remarks: 'Turnaround per flight at TRV.' },
    ],
    rules: [
      rule('Unaccompanied Minor', 12, 'USD', 'Per Flight', {}),
      rule('Wheel Chair - WCHR/S', 14, 'USD', 'Per Unit', { free: 6, remarks: '6 WCHR/WCHS included. The free count is adjusted from actual WCHR/WCHS use only.' }),
      rule('Wheel Chair-WCHC', 15, 'USD', 'Per Service', { remarks: 'Charged in addition to the WCHR/WCHS allowance.' }),
      rule('Deportee', 12, 'USD', 'Per Hour', { remarks: 'Staff engaged beyond scheduled ground time.' }),
      rule('Ambulift', 155, 'USD', 'Per Usage', {}),
      rule('Ground Power Unit', 145, 'USD', 'Per Hour', { remarks: 'Only at remote parking or when BME is unserviceable. Ten hours of use in one year are free, reconciled at year end.' }),
      rule('Air Conditioner Unit', 170, 'USD', 'Per Hour', { remarks: 'Remote parking or when BME is unserviceable.' }),
      rule('Air Start Unit', 170, 'USD', 'Per Start', {}),
      rule('Pax Step Ladder', 90, 'USD', 'Per Hour', { remarks: 'Beyond scheduled ground time.' }),
      rule('Passenger Coach', 145, 'USD', 'Per Turnaround', {}),
      rule('Crew Coach', 60, 'USD', 'Per Turnaround', {}),
      rule('Push Back', 140, 'USD', 'Per Push', {}),
      rule('Towing', 150, 'USD', 'Per Tow', {}),
      rule('LD3', 6, 'USD', 'Per ULD', { free: 10, remarks: '10 LD3 free. USD 6 per additional LD3 beyond 10, per scheduled daily turnaround.' }),
      rule('Utility Hand', 16, 'USD', 'Per Turnaround', { remarks: 'Per staff per scheduled turnaround.' }),
      rule('Additional Agent', 25, 'USD', 'Per Turnaround', { remarks: 'Per staff per scheduled turnaround.' }),
    ],
    clauses: [
      clause('Term', 'Thiruvananthapuram (TRV), effective 15 September 2023. No end date is printed.'),
      clause('1.3', 'Technical landing is 50% when there is no physical change of load. Return to ramp without a change of load is not charged extra.'),
      clause('1.6', 'Live-in ferry-out is 80%. Ferry-in live-out is 90%.'),
      clause('1.9', 'Cancellation within 12 hours is 50%.'),
      clause('1.10', 'Off schedule by more than 4 hours: 10% for every two hours of delay.'),
      clause('Excess baggage', '8% commission, or the handler recovers the collection fee from the passengers directly.'),
      clause('Cargo', 'Ramp cargo transport is included. Warehouse acceptance, build-up, manifesting and stacking are USD 120 up to 1 tonne and USD 70 for every additional 500 kg or part.'),
    ],
  },
  {
    station: 'TRV',
    contractNumber: 'WY-TRV-SGHA',
    customerCode: 'WY',
    name: 'Oman Air',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: ['B737-800', 'B737-900', 'B737-8 MAX', 'B787-800', 'B787-900', 'A330-200', 'A330-300'],
    from: '2023-10-01',
    to: '2026-09-30',
    openEnded: false,
    coverage: 'non_comprehensive',
    concessionNote: 'Prices exclude airport concession or royalty, and exclude GST.',
    conditional: { technicalHandlingChargesPercent: 50, returnToRamp: 0, cancellationWithinHours: 12, cancellationWithinHoursPercent: 50, delayChargesPercent: 10, filoLifoChargesPercent: 75 },
    bhs: [
      { aircraft: ['B737-800', 'B737-900', 'B737-8 MAX'], category: 'Int', price: 1225, remarks: 'Per flight. Printed rate. A 6% yearly increase from 1 October 2024 is agreed and was not calculated into this amount.' },
      { aircraft: ['B787-800', 'B787-900', 'A330-200', 'A330-300'], category: 'Int', price: 2445, remarks: 'Per flight. Same 6% yearly increase is not calculated into this amount.' },
    ],
    rules: [
      rule('Station Management', 1350, 'USD', 'Per Month', { remarks: 'Up to 2 flights per day when operated in different shifts.' }),
      rule('Departure Stationery', 38, 'USD', 'Per Flight', { remarks: 'Boarding passes and baggage tags.' }),
      rule('Wheel Chair - WCHR/S', 12, 'USD', 'Per Unit', { free: 5 }),
      rule('Wheel Chair-WCHC', 18, 'USD', 'Per Unit', {}),
      rule('Ambulift', 135, 'USD', 'Per Usage', {}),
      rule('Ground Power Unit', 98, 'USD', 'Per Hour', {}),
      rule('Air Conditioner Unit', 175, 'USD', 'Per Hour', { remarks: 'Remote bay only.' }),
      rule('Air Start Unit', 90, 'USD', 'Per Start', {}),
      rule('Passenger Coach', 95, 'USD', 'Per Turnaround', {}),
      rule('Crew Coach', 42, 'USD', 'Per Turnaround', {}),
      rule('Push Back', 140, 'USD', 'Per Push', { free: 1, remarks: 'One pushback included.' }),
      rule('Towing', 195, 'USD', 'Per Tow', {}),
      rule('Cargo Supervision', 100, 'USD', 'Per Flight', { remarks: 'Includes a white-collar supervisor and loading staff for airport and city-side acceptance. Also cargo supervision.' }),
      rule('Line Maintenance Assistance', 65, 'USD', 'Per Flight', { remarks: 'Per staff per flight.' }),
      rule('White Collar', 15, 'USD', 'Per Hour', {}),
      rule('Utility Hand', 12, 'USD', 'Per Hour', {}),
    ],
    clauses: [
      clause('Term', 'Thiruvananthapuram (TRV), 1 October 2023 until 30 September 2026. From 1 October 2024 the rates increase 6% a year. The saved amounts are the printed rates, not the compounded increase.'),
      clause('1.4', 'Technical landing is 50% when there is no physical change of load. Return to ramp without a change of load is not charged extra.'),
      clause('1.6', 'Empty ferry flights are 75%.'),
      clause('1.8', 'Cancellation within 12 hours is 50%.'),
      clause('1.10', 'A delay not caused by the handler is 10% beyond 2 hours and 20% beyond 4 hours.'),
      clause('Excess baggage', '10% of the collection.'),
      clause('3.1', 'Disbursements are at cost plus 10%, with receipts.'),
    ],
  },
  {
    station: 'TRV',
    contractNumber: 'UL-TRV-SGHA',
    customerCode: 'UL',
    name: 'SriLankan Airlines',
    currency: 'USD',
    category: 'Int',
    aircraftTypes: [...NB, ...UL_WB, 'A330-200'],
    from: '2024-04-01',
    to: '2027-03-31',
    openEnded: false,
    coverage: 'non_comprehensive',
    concessionNote: 'Charges exclude airport concession, royalty, service tax and surcharges.',
    conditional: { technicalHandlingChargesPercent: 25, returnToRamp: 0, cancellationWithinHours: 12, cancellationWithinHoursPercent: 50, delayChargesPercent: 10 },
    bhs: [
      { aircraft: NB, category: 'Int', price: 911, remarks: 'Turnaround. Transit is USD 708.' },
      { aircraft: UL_WB, category: 'Int', price: 1910, remarks: 'Turnaround for A330 and A350. Transit is USD 1,685.' },
      { aircraft: ['A330-200'], category: 'Int', price: 1533, remarks: 'Converted passenger aircraft with 24 PKC cabin positions, and the A330 freighter. Transit is USD 1,365.' },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 11, 'USD', 'Per Unit', { free: 5 }),
      rule('Wheel Chair-WCHC', 15, 'USD', 'Per Unit', {}),
      rule('Ambulift', 129, 'USD', 'Per Usage', {}),
      rule('Ground Power Unit', 90, 'USD', 'Per Turnaround', { remarks: 'Unit column also says per hour or part.' }),
      rule('Air Conditioner Unit', 145, 'USD', 'Per Hour', {}),
      rule('Air Start Unit', 120, 'USD', 'Per Start', {}),
      rule('Towing', 220, 'USD', 'Per Tow', {}),
      rule('Push Back', 140, 'USD', 'Per Push', {}),
      rule('Pax Step Ladder', 120, 'USD', 'Per Hour', { remarks: 'Up to 2 for remote operations.' }),
      rule('Passenger Coach', 65, 'USD', 'Per Turnaround', {}),
      rule('Crew Coach', 27, 'USD', 'Per Turnaround', {}),
      rule('Disinfection', 49, 'USD', 'Per Turnaround', {}),
      rule('Potable Water', 61, 'USD', 'Per Service', { free: 1 }),
      rule('Toilet Service', 55, 'USD', 'Per Service', { free: 1 }),
      rule('Cargo Supervision', 32, 'USD', 'Per Turnaround', { remarks: 'Delivery-order charges are retained by the handler. Documentation per flight in the cargo table is USD 32.' }),
      rule('Blue Collar', 18, 'USD', 'Per Hour', {}),
      rule('White Collar', 24, 'USD', 'Per Hour', {}),
    ],
    clauses: [
      clause('Term', 'Thiruvananthapuram (TRV), 1 April 2024 until 31 March 2027. From 1 April 2025, rates in paragraph 1.2 and paragraph 2 increase by RBI CPI, capped at 5%. The increased amount is not printed.'),
      clause('Transit', 'Transit rates: narrow-body USD 708; A330/A350 USD 1,685; converted A330-200 and A330 freighter USD 1,365.'),
      clause('1.3', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.4', 'Return to ramp with a physical change of load is 35%.'),
      clause('1.6', 'Technical landing for a non-commercial purpose is 25% when there is no physical change of load.'),
      clause('1.12', 'Off schedule by more than 4 hours: 10% for every two hours of delay.'),
      clause('1.13', 'A mixed domestic and international turnaround is charged at the international rate.'),
      clause('1.15', 'The cancellation line says twenty-four (12) hours at fifty percent (50%). The figures used are 12 hours and 50%.'),
      clause('Cargo', 'Warehouse export, screening, import and transfer per kg are NA. Warehouse-to-aircraft transport is included. Cargo acceptance, build-up, manifesting and stacking are USD 120 up to 1 tonne and USD 70 for every additional 500 kg.'),
      clause('3.1', 'Disbursements are at cost plus 5%.'),
      clause('Excess baggage', '5% commission is retained.'),
    ],
  },
];

function stripZero(rules) {
  return rules.filter((row) => (row.unitPriceINR ?? 0) > 0 || (row.unitPriceUSD ?? 0) > 0);
}

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();
const summary = [];

for (const item of contracts) {
  const station = item.station;
  const rules = stripZero(item.rules);
  const existingCustomer = await billing.findOne({
    docType: 'customer',
    stationCode: station,
    customerCode: item.customerCode,
  });
  if (!existingCustomer) {
    await billing.insertOne({
      docType: 'customer',
      customerCode: item.customerCode,
      name: item.name,
      airlineInvoiceName: item.name,
      currencyCode: item.currency,
      stationCode: station,
      priceCardHandlingTypes: ['BHS', 'ADS'],
      blocked: false,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await billing.updateOne(
      { _id: existingCustomer._id, stationCode: station },
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
    stationCode: station,
    category: item.category,
    categories: item.category === 'Both' ? ['Dom', 'Int'] : [item.category],
    aircraftTypes: item.aircraftTypes,
    priceValidFrom: day(item.from),
    priceValidTo: day(item.to, true),
    openEnded: item.openEnded,
    status: 'active',
    adsBillingEnabled: rules.length > 0,
    bhsConcessionCoverage: item.coverage,
    bhsConcessionNote: item.concessionNote,
    conditionalCharges: item.conditional,
    clauses: item.clauses,
    adsEquipmentRules: rules,
    updatedAt: now,
  };
  const existing = await billing.findOne({
    docType: 'contract',
    stationCode: station,
    contractNumber: item.contractNumber,
  });
  if (existing) {
    await billing.updateOne({ _id: existing._id, stationCode: station }, { $set: contractFields });
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
      stationCode: station,
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
          remarks: `${station} SGHA. ${pkg.remarks}`,
          aircraftType,
          category: pkg.category,
          ...(handlingType === 'BHS' ? { price: pkg.price } : {}),
          currencyCode: item.currency,
          openEnded: item.openEnded,
          flightOperation: 'scheduled',
          stationCode: station,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      bhsCount += 1;
    }
  }
  summary.push({ station, contract: item.contractNumber, rules: rules.length, bhsCards: bhsCount });
}

console.log(JSON.stringify({ summary }, null, 2));
await client.close();
