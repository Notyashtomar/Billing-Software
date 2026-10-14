import { mapFhrToInvoicingFlightReportRow } from './invoicing-flight-report.mapper';

describe('mapFhrToInvoicingFlightReportRow customer fields', () => {
  it('extracts airline code when Arline_Code is wrongly stored as flight number', () => {
    const row = mapFhrToInvoicingFlightReportRow(19315, {
      SerialNo: 19315,
      mainDetails: {
        SerialNo: 19315,
        Airline: 'Air India Express',
        Arline_Code: 'IX2718',
        ArrivalFltNo: '',
        DepartureFltNo: '',
        Typeofflight: 'Diverted Flight',
        TypeofHandling: 'Additional',
        Cate_of_Flight: 'Domestic',
      },
      terminalDetails: {
        airlinesOperator: 'Air India Express',
        FlightNo: 'IX2718',
      },
      remarks: { Airline: 'Air India Express' },
    });

    expect(row.customerCode).toBe('IX');
    expect(row.customerName).toBe('Air India Express');
  });

  it('shows the stored CANC flight number instead of the split legs', () => {
    const row = mapFhrToInvoicingFlightReportRow(127621, {
      SerialNo: 127621,
      mainDetails: {
        FlightNo: 'CANC -FD 196/197',
        ArrivalFltNo: 'FD196',
        DepartureFltNo: 'FD197',
        Airline: 'Thai AirAsia',
        Arline_Code: 'FD',
      },
    });
    expect(row.flightNoEquipmentNo).toBe('CANC-FD196/197');
  });

  it('keeps a clean airline code unchanged', () => {
    const row = mapFhrToInvoicingFlightReportRow(1, {
      SerialNo: 1,
      mainDetails: {
        Airline: 'SpiceJet',
        Arline_Code: 'SG',
        ArrivalFltNo: 'SG9151A',
        DepartureFltNo: 'SG9151D',
        Cate_of_Flight: 'Domestic',
      },
    });

    expect(row.customerCode).toBe('SG');
    expect(row.customerName).toBe('SpiceJet');
  });

  it('ignores airline-code-as-name and uses operator name (US-Bangla)', () => {
    const row = mapFhrToInvoicingFlightReportRow(420026, {
      SerialNo: 420026,
      mainDetails: {
        Airline: 'BS',
        Arline_Code: 'BS',
        ArrivalFltNo: 'BS205',
        DepartureFltNo: 'BS206',
        Cate_of_Flight: 'International',
      },
      terminalDetails: {
        airlinesOperator: 'US-Bangla Airlines',
        FlightNo: 'BS205/206',
      },
      remarks: { Airline: 'BS' },
    });

    expect(row.customerCode).toBe('BS');
    expect(row.customerName).toBe('US-Bangla Airlines');
  });

  it('extracts airline code from spaced FHR tokens (IXC)', () => {
    const row = mapFhrToInvoicingFlightReportRow(1, {
      SerialNo: 1,
      mainDetails: {
        Airline: 'Air India Express',
        Arline_Code: 'IX 1498/ IX 1604',
        ArrivalFltNo: 'IX 1498',
        DepartureFltNo: 'IX 1604',
        Cate_of_Flight: 'Domestic',
      },
    });

    expect(row.customerCode).toBe('IX');
    expect(row.customerName).toBe('Air India Express');
  });
});
