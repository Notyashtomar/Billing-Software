import type { InvoicePdfInput } from './invoice-pdf.types';
import { buildInvoicePdfInput } from './invoice-pdf.mapper';

/**
 * Sample invoice matching finance reference SI/MA/327/000055
 * (Sri Lankan Airlines — international ramp handling, Mar 2026).
 */
export function buildSampleInvoicePdfInput(): InvoicePdfInput {
  const roe = 94.6543;
  const lines = [
    {
      lineNo: 1,
      description: 'Charges for Passenger and Ramp Handling Services',
      quantity: 40,
      uom: 'Per Flight',
      unitPrice: 750,
      lineAmountExclTax: 30000,
      lineAmountInclTax: 30000,
      serviceCode: 'BHS',
      gstPercent: 18,
      sourceRef: { usedQuantity: 40, aircraftType: 'A330-300' },
    },
    {
      lineNo: 2,
      description: 'Charges for Passenger and Ramp Handling Services',
      quantity: 140,
      uom: 'Per Flight',
      unitPrice: 385,
      lineAmountExclTax: 53900,
      lineAmountInclTax: 53900,
      serviceCode: 'BHS',
      gstPercent: 18,
      sourceRef: { usedQuantity: 132, aircraftType: 'A320-200' },
    },
    {
      lineNo: 3,
      description: 'Charges for Passenger and Ramp Handling Services',
      quantity: 2,
      uom: 'Per Flight',
      unitPrice: 750,
      lineAmountExclTax: 1500,
      lineAmountInclTax: 1500,
      serviceCode: 'BHS',
      gstPercent: 18,
      sourceRef: { usedQuantity: 2, aircraftType: 'A330-300' },
    },
    {
      lineNo: 4,
      description: 'Charges for Passenger and Ramp Handling Services',
      quantity: 12,
      uom: 'Per Flight',
      unitPrice: 385,
      lineAmountExclTax: 4620,
      lineAmountInclTax: 4620,
      serviceCode: 'BHS',
      gstPercent: 18,
      sourceRef: { usedQuantity: 14, aircraftType: 'A320-200' },
    },
  ];

  return buildInvoicePdfInput({
    header: {
      invoiceNumber: 'SI/MA/327/000055',
      draftNumber: 'SI/MA/327/000055',
      customerCode: 'UL',
      customerName: 'SRILANKAN AIRLINES LIMITED',
      documentDate: new Date('2026-04-02'),
      currencyCode: 'USD',
      currencyFactor: roe,
      subtotalExclTax: 90086,
      taxTotal: 18647.8,
      totalInclTax: 11571176,
      billingPeriodStart: new Date('2026-03-01'),
      billingPeriodEnd: new Date('2026-03-31'),
      stationCode: 'MAA',
    },
    lines,
    settings: {
      companyLegalEntity: {
        name: 'BIRD AIRPORT SERVICES (CHENNAI) PRIVATE LIMITED',
        address:
          'DOMESTIC TERMINAL, NEW DOMESTIC TERMINAL, BUILDING(T-1), AIRPORT CHENNAI 600016',
        gstin: '33AALCB3911H1ZX',
        cin: 'U63032TN2023PTC158390',
        phone: '30417700',
      },
      bankDetails: {
        bankName: 'HDFC BANK',
        branchAddress: 'M-36, OUTER CIRCLE, CONNAUGHGT PLACE, NEW DELHI – 110001, DELHI',
        beneficiaryName: 'Bird Airport SVC Chennai PL CLN Escrow AC',
        accountNumber: '99900000600016',
        swiftCode: 'HDFCINBB',
      },
    },
    customer: {
      name: 'SRILANKAN AIRLINES LIMITED',
      gstRegistrationNo: '33AAECS3720Q1Z5',
      globalDimension1: 'Tamil Nadu',
      globalDimension2:
        '8th Floor, No.108, Westminster Building, Dr. Radhakrishnan Salai, Mylapore, Chennai, CHENNAI-600004 India',
    },
    serviceCatalog: [{ serviceCode: 'BHS', sacCode: '996761', category: 'international' }],
    concessionFeePercent: 15,
    irn: '39116f9d2f2bb7eb21e3a4c28f1e00dc7020618dd0f9d8c2efd84bbda6682976',
    hasAnnexures: true,
  });
}
