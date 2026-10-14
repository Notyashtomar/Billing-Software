import {
  delhiRevSummaryHeaders,
  formatDelhiRevTitleMonth,
  getBhsMisStationProfile,
  stampDelhiRevSummaryTitle,
  resolveBhsMisLayout,
  workbookSheetDefs,
} from './billing-mis-bhs-profile.util';
import {
  flightRowMatchesStation,
  mapSourceRowToMisFlight,
} from './billing-mis-bhs-export.util';

describe('BHS MIS station profile', () => {
  it('labels IXC as Chandigarh and keeps MAA layout template', () => {
    const profile = getBhsMisStationProfile('IXC');
    expect(profile.stationLabel).toBe('Chandigarh');
    expect(profile.layout).toBe('maa');
    expect(profile.templateFile).toBe('maa-template.xlsx');
    expect(resolveBhsMisLayout('IXC')).toBe('maa');
  });

  it('keeps Chennai / Delhi labels for home stations', () => {
    expect(getBhsMisStationProfile('MAA').stationLabel).toBe('Chennai');
    expect(getBhsMisStationProfile('DEL').stationLabel).toBe('Delhi');
    expect(getBhsMisStationProfile('DEL').layout).toBe('del');
  });

  it('names Delhi revenue headers from the export month and the previous month', () => {
    expect(delhiRevSummaryHeaders('2026-08-01')).toEqual({
      flightOf: 'Flight of July 2026',
      invoiceAmount: 'Actual Invoice Amount for August 2026',
      invoiceInr: 'Actual Invoice Amount in INR for August 2026',
      prevInr: 'Amount of July 2026 in INR',
      prevOnly: 'Adjusted Revenue of July 2026',
    });
    expect(delhiRevSummaryHeaders('2026-01-15').flightOf).toBe('Flight of December 2025');
  });

  it('stamps the Rev_Summary banner with the downloaded month', () => {
    expect(formatDelhiRevTitleMonth('2026-08-01')).toBe("Aug' 26");
    expect(formatDelhiRevTitleMonth('2026-01-15')).toBe("Jan' 26");
    expect(
      stampDelhiRevSummaryTitle(
        "Bird Flight Services (India) Pvt. Ltd. (BHS of Delhi - Nov'25)",
        '2026-08-01',
      ),
    ).toBe("Bird Flight Services (India) Pvt. Ltd. (BHS of Delhi - Aug' 26)");
  });

  it('lists only workbook sheets, in workbook order', () => {
    const defs = getBhsMisStationProfile('DEL').sheets;
    const workbook = ['Rev_Summary', 'FRIS Data', 'Not A Real Sheet', 'Proj_Skd'];
    expect(workbookSheetDefs(defs, workbook).map((sheet) => sheet.sheetName)).toEqual([
      'Rev_Summary',
      'FRIS Data',
      'Proj_Skd',
    ]);
  });
});

describe('BHS MIS flight mapping / station guard', () => {
  it('reads flightNoEquipmentNo and billing eligibility', () => {
    const mapped = mapSourceRowToMisFlight({
      billingEligibility: { eligible: true },
      sourceRef: { flightNo: 'IX1686' },
      operationalData: {
        flightNoEquipmentNo: 'IX1686/IX1062',
        TypeCraft: 'A320-200',
        customerCode: 'IX',
        airlineName: 'Air India Express',
        staDate: '2026-08-08',
        categoryOfFlight: 'Scheduled',
      },
    });
    expect(mapped).toMatchObject({
      flightNo: 'IX1686',
      aircraftType: 'A320-200',
      customerCode: 'IX',
      scheduleDate: '2026-08-08',
      eligible: true,
      cancelled: false,
    });
  });

  it('normalizes FHR STADate from terminal details', () => {
    const mapped = mapSourceRowToMisFlight({
      operationalData: {
        flightNoEquipmentNo: 'IX1686',
        TypeCraft: 'B737-800',
        airlineCode: 'IX',
        terminalDetails: { STADate: '12/08/2026' },
        mainDetails: { TypeCraft: 'B737-800', Arline_Code: 'IX' },
        skdNonSkd: 'Scheduled',
      },
    });
    expect(mapped).toMatchObject({
      flightNo: 'IX1686',
      aircraftType: 'B737-800',
      customerCode: 'IX',
      scheduleDate: '2026-08-12',
    });
  });

  it('uses IATA from flight number and TypeCraft, not operator customer codes', () => {
    const mapped = mapSourceRowToMisFlight({
      operationalData: {
        flightNo: 'Heli',
        flightNoEquipmentNo: 'IX1498/IX1604',
        customerCode: 'AAPL',
        airlineCode: 'SKP',
        TypeCraft: 'B737-800',
        aircraftType: 'NB',
        staDate: '2026-08-12',
        categoryOfFlight: 'Scheduled',
        skdNonSkd: 'Scheduled',
      },
    });
    expect(mapped).toMatchObject({
      flightNo: 'IX1498/IX1604',
      aircraftType: 'B737-800',
      customerCode: 'IX',
    });
  });

  it('rejects rows stamped for another station', () => {
    expect(
      flightRowMatchesStation(
        { operationalData: { stationCode: 'MAA' } },
        'IXC',
      ),
    ).toBe(false);
    expect(
      flightRowMatchesStation(
        { operationalData: { stationCode: 'CHANDIGARH' } },
        'IXC',
      ),
    ).toBe(true);
    expect(
      flightRowMatchesStation({ operationalData: {} }, 'IXC'),
    ).toBe(true);
  });
});
