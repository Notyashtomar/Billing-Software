import {
  CHENNAI_INVOICE_DEFAULTS,
  resolveAirportConfig,
  resolveInvoiceBankDefaults,
  resolveInvoiceCompanyDefaults,
  resolveInvoiceContacts,
} from './invoice-pdf.defaults';

describe('invoice-pdf.defaults — station scoping', () => {
  it('keeps the Chennai reference invoice values unchanged for MAA', () => {
    const company = resolveInvoiceCompanyDefaults('MAA');
    expect(company).toEqual(CHENNAI_INVOICE_DEFAULTS.company);

    const airport = resolveAirportConfig('MAA');
    expect(airport.serviceStation).toBe('CHENNAI');
    expect(airport.state).toBe('Tamil Nadu');
    expect(airport.placeOfSupply).toBe('Tamil Nadu');

    expect(resolveInvoiceBankDefaults('MAA')).toEqual(CHENNAI_INVOICE_DEFAULTS.bank);
    expect(resolveInvoiceContacts('CHENNAI')).toHaveLength(3);
  });

  it('uses the Chandigarh entity, address, GSTIN and state for IXC', () => {
    const company = resolveInvoiceCompanyDefaults('IXC');
    expect(company.name).toBe('BIRD AIRPORT SERVICES (MOHALI) PVT. LTD.');
    expect(company.gstin).toBe('03AAJCB7598L1Z2');
    expect(company.pan).toBe('AAJCB7598L');
    expect(company.address).toContain('CHANDIGARH INTERNATIONAL AIRPORT');
    expect(company.address).toContain('140307');

    const airport = resolveAirportConfig('IXC');
    expect(airport.serviceStation).toBe('CHANDIGARH');
    expect(airport.state).toBe('Punjab');
    expect(airport.placeOfSupply).toBe('Punjab');
  });

  it('never leaks Chennai identity, bank or station contact onto another station', () => {
    const company = resolveInvoiceCompanyDefaults('IXC');
    expect(company.gstin).not.toBe(CHENNAI_INVOICE_DEFAULTS.company.gstin);
    expect(company.address).not.toBe(CHENNAI_INVOICE_DEFAULTS.company.address);
    expect(company.cin).toBe('');
    expect(company.phone).toBe('');

    expect(resolveInvoiceBankDefaults('IXC')).toEqual({
      bankName: '',
      branchAddress: '',
      beneficiaryName: '',
      accountNumber: '',
      swiftCode: '',
    });

    const contacts = resolveInvoiceContacts('CHANDIGARH');
    expect(contacts.every((row) => row.location !== 'Station Office')).toBe(true);
  });

  it('lets station settings override the registry', () => {
    const company = resolveInvoiceCompanyDefaults('IXC', {
      name: 'BIRD AIRPORT SERVICES (MOHALI) PRIVATE LIMITED',
      address: 'NEW CIVIL TERMINAL, MOHALI',
      gstin: '03AAJCB7598L1Z2',
      cin: 'U63030PB2020PTC051234',
      phone: '1725000000',
    });
    expect(company.name).toBe('BIRD AIRPORT SERVICES (MOHALI) PRIVATE LIMITED');
    expect(company.cin).toBe('U63030PB2020PTC051234');

    const bank = resolveInvoiceBankDefaults('IXC', {
      bankName: 'HDFC BANK',
      accountNumber: '99900000600099',
    });
    expect(bank.bankName).toBe('HDFC BANK');
    expect(bank.accountNumber).toBe('99900000600099');
    expect(bank.beneficiaryName).toBe('');
  });

  it('blanks state and identity for a station missing from the registry', () => {
    const airport = resolveAirportConfig('ZZZ');
    expect(airport.serviceStation).toBe('ZZZ');
    expect(airport.state).toBe('');
    expect(airport.placeOfSupply).toBe('');
    expect(airport.sacCode).toBe(CHENNAI_INVOICE_DEFAULTS.sacCode);

    const company = resolveInvoiceCompanyDefaults('ZZZ');
    expect(company.gstin).toBe('');
    expect(company.address).toBe('');
  });
});
