import {
  categoriesOfFlightFromSnapshots,
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
