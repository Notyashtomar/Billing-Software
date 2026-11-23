import {
  categoriesOfFlightFromSnapshots,
  isInternationalOnlyAirline,
  pickCategoryOfFlight,
  resolveInvoiceFlightCategory,
} from './invoice-flight-category.util';

describe('invoice-flight-category.util', () => {
  it('reads the flight category from any FHR / snapshot key spelling', () => {
    expect(pickCategoryOfFlight({ categoryOfFlight: 'Int' })).toBe('Int');
    expect(pickCategoryOfFlight({ Cate_of_Flight: 'Domestic' })).toBe('Domestic');
    expect(pickCategoryOfFlight({}, { domInt: 'INT' })).toBe('INT');
    expect(pickCategoryOfFlight(undefined, null, {})).toBe('');
  });

  it('labels Dom / Int variants for the invoice header', () => {
    expect(resolveInvoiceFlightCategory(['Dom'])).toBe('Domestic');
    expect(resolveInvoiceFlightCategory(['international'])).toBe('International');
    expect(resolveInvoiceFlightCategory(['INT'])).toBe('International');
    expect(resolveInvoiceFlightCategory([undefined, '', 'Ta'])).toBe('');
  });

  it('shows both when one invoice mixes domestic and international flights', () => {
    expect(resolveInvoiceFlightCategory(['Dom', 'Int'])).toBe('Domestic & International');
  });

  it('prints International for an international-only airline even when a flight is tagged domestic', () => {
    expect(isInternationalOnlyAirline({ category: 'Int', categories: ['Int'] })).toBe(true);
    expect(isInternationalOnlyAirline({ category: 'Both', categories: ['Dom', 'Int'] })).toBe(false);
    expect(
      resolveInvoiceFlightCategory(['International-Domestic', 'Domestic'], {
        category: 'Int',
        categories: ['Int'],
      }),
    ).toBe('International');
    expect(resolveInvoiceFlightCategory(['Domestic'], { category: 'Dom', categories: ['Dom'] })).toBe(
      'Domestic',
    );
  });

  it('keeps the cargo sector on freighter invoices', () => {
    expect(resolveInvoiceFlightCategory(['International-Cargo'])).toBe('International Cargo');
    expect(resolveInvoiceFlightCategory(['IntCargo', 'International Cargo'])).toBe(
      'International Cargo',
    );
    expect(resolveInvoiceFlightCategory(['Domestic-Cargo'])).toBe('Domestic Cargo');
    expect(resolveInvoiceFlightCategory(['International', 'International-Cargo'])).toBe(
      'International & International Cargo',
    );
  });

  it('prints International Cargo for an international-only cargo airline', () => {
    const cargoAirline = { category: 'Int', categories: [] };
    expect(resolveInvoiceFlightCategory(['International-Cargo'], cargoAirline)).toBe(
      'International Cargo',
    );
    expect(resolveInvoiceFlightCategory(['Domestic-Cargo'], cargoAirline)).toBe(
      'International Cargo',
    );
    expect(resolveInvoiceFlightCategory([], cargoAirline)).toBe('International');
  });

  it('collects distinct categories across the records behind a line', () => {
    expect(
      categoriesOfFlightFromSnapshots([
        { categoryOfFlight: 'Int' },
        { categoryOfFlight: 'Int' },
        { Cate_of_Flight: 'Dom' },
        undefined,
        {},
      ]),
    ).toEqual(['Int', 'Dom']);
  });
});
