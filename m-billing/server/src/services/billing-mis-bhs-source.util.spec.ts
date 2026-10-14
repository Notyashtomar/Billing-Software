import {
  bhsMisAirlineFullName,
  bhsMisDedupFlights,
  buildBhsMisRevRows,
  convertBillingAmountToInr,
  indexBhsEligibleFlights,
  rollupBhsInvoicesByAirline,
} from './billing-mis-bhs-source.util';

describe('billing-mis-bhs-source.util', () => {
  it('keeps the airline full name and drops a leading code', () => {
    expect(bhsMisAirlineFullName('Air India', 'AI')).toBe('Air India');
    expect(bhsMisAirlineFullName('AI - Air India', 'AI')).toBe('Air India');
    expect(bhsMisAirlineFullName('AI', 'AI')).toBe('');
  });

  it('dedupes the same flight date and aircraft', () => {
    const rows = bhsMisDedupFlights([
      {
        flightNo: '6E101',
        aircraftType: 'A320',
        customerCode: '6E',
        airlineName: 'IndiGo',
        scheduleDate: '2026-07-01',
        eligible: true,
      },
      {
        flightNo: '6E101',
        aircraftType: 'A320',
        customerCode: '6E',
        airlineName: 'IndiGo',
        scheduleDate: '2026-07-01',
        eligible: true,
      },
    ]);
    expect(rows).toHaveLength(1);
  });

  it('indexes eligible flights and fills rev rows from price cards + invoices', () => {
    const flights = [
      {
        flightNo: '6E101',
        aircraftType: 'A320',
        customerCode: '6E',
        airlineName: 'IndiGo',
        scheduleDate: '2026-07-01',
        eligible: true,
      },
      {
        flightNo: '6E102',
        aircraftType: 'A320',
        customerCode: '6E',
        airlineName: 'IndiGo',
        scheduleDate: '2026-07-02',
        eligible: true,
      },
      {
        flightNo: '6E103',
        aircraftType: 'A320',
        customerCode: '6E',
        airlineName: 'IndiGo',
        scheduleDate: '2026-07-03',
        cancelled: true,
        eligible: true,
      },
    ];
    const index = indexBhsEligibleFlights(flights);
    expect(index.byAirline.get('6E')).toBe(2);
    expect(index.byAirlineAircraft.get('6E|A320')).toBe(2);

    const rows = buildBhsMisRevRows(
      [
        {
          customerCode: '6E',
          airlineName: 'IndiGo',
          aircraftType: 'A320',
          category: 'Domestic',
          packagePriceUsd: 100,
        },
      ],
      [{ customerCode: '6E', invoiceNumber: 'BHS-1', totalInclTax: 500 }],
      flights,
      83,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].flightCount).toBe(2);
    expect(rows[0].currentFlightCount).toBe(2);
    expect(rows[0].categoryDomInt).toBe('Dom');
    expect(rows[0].invoiceNumber).toBe('BHS-1');
    expect(rows[0].invoiceTotal).toBe(500);
    expect(rows[0].invoiceAmount).toBe(500);
    expect(rows[0].invoiceAmountInr).toBe(500);
    expect(rows[0].prevMonthFlightCount).toBe(2);
    expect(rows[0].prevInvoiceAmountInr).toBe(0);
    expect(rows[0].roeToInr).toBe(83);
  });

  it('fills Delhi month columns from the previous month and current drafts', () => {
    const julyFlights = [
      {
        flightNo: 'AI101',
        aircraftType: 'B777',
        customerCode: 'AI',
        airlineName: 'Air India',
        scheduleDate: '2026-07-04',
        eligible: true,
      },
      {
        flightNo: 'AI102',
        aircraftType: 'A320',
        customerCode: 'AI',
        airlineName: 'Air India',
        scheduleDate: '2026-07-05',
        eligible: true,
      },
      {
        flightNo: 'AI103',
        aircraftType: 'A320',
        customerCode: 'AI',
        airlineName: 'Air India',
        scheduleDate: '2026-07-06',
        cancelled: true,
        eligible: true,
      },
    ];
    const augustFlights = [
      {
        flightNo: 'AI201',
        aircraftType: 'B777',
        customerCode: 'AI',
        airlineName: 'Air India',
        scheduleDate: '2026-08-01',
        eligible: true,
      },
    ];
    const rows = buildBhsMisRevRows(
      [
        {
          customerCode: 'AI',
          airlineName: 'Air India',
          aircraftType: 'B777',
          category: 'International',
        },
        {
          customerCode: 'AI',
          airlineName: 'Air India',
          aircraftType: 'A320',
          category: 'Domestic',
        },
      ],
      [
        { customerCode: 'AI', invoiceNumber: 'D1', totalInclTax: 200, currency: 'USD' },
        { customerCode: 'AI', invoiceNumber: 'D2', totalInclTax: 50, currency: 'USD' },
      ],
      augustFlights,
      90,
      {
        previousFlights: julyFlights,
        previousInvoices: [
          { customerCode: 'AI', invoiceNumber: 'P1', totalInclTax: 100, currency: 'USD' },
        ],
        previousRoeToInr: 80,
      },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].prevMonthFlightCount).toBe(2);
    expect(rows[1].prevMonthFlightCount).toBe(2);
    expect(rows[0].flightCount).toBe(1);
    expect(rows[0].invoiceAmount).toBe(250);
    expect(rows[0].invoiceAmountInr).toBe(22500);
    expect(rows[1].invoiceAmountInr).toBe(22500);
    expect(rows[0].prevInvoiceAmountInr).toBe(8000);
    expect(convertBillingAmountToInr(10, 'INR', 90)).toBe(10);
    expect(rollupBhsInvoicesByAirline(
      [{ customerCode: 'QR', totalInclTax: 40, currency: 'INR' }],
      90,
    ).get('QR')?.inr).toBe(40);
  });
});
