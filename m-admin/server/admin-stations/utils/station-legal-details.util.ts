/**
 * Station legal / GST registry from Bird ops master sheet.
 * Matched onto AdminStation rows by `stationCode` or operational `city` aliases.
 * `addressCity` is the registered/billing city (often New Delhi), distinct from ops `city`.
 */
export type StationLegalDetails = {
  /** Operational city aliases used to match existing registry rows. */
  cityAliases: string[];
  stationCode: string;
  company: string;
  street: string;
  addressCity: string;
  country: string;
  pincode: string;
  gstNumber: string;
  /** Corporate Identification Number (MCA). Optional — printed on invoices when known. */
  cin?: string;
};

export const STATION_LEGAL_DETAILS: StationLegalDetails[] = [
  {
    cityAliases: ['Delhi', 'New Delhi'],
    stationCode: 'DEL',
    company: 'Bird Flight Services (India) Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '07AADCB5921B1Z6',
    cin: 'U62200DL2008PTC184155',
  },
  {
    cityAliases: ['Kochi', 'Cochin'],
    stationCode: 'COK',
    company: 'Bird Flight Services (India) Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '32AADCB5921B1ZD',
  },
  {
    cityAliases: ['Mumbai', 'Bombay'],
    stationCode: 'BOM',
    company: 'Bird Airport Service Mumbai Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '27AAGCB5959C1ZL',
  },
  {
    cityAliases: ['Bengaluru', 'Bangalore'],
    stationCode: 'BLR',
    company: 'GlobeGround India Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '29AAACG8313K1ZF',
  },
  {
    cityAliases: ['Hyderabad'],
    stationCode: 'HYD',
    company: 'GlobeGround India Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '36AAACG8313K1ZK',
  },
  {
    cityAliases: ['Ahmedabad'],
    stationCode: 'AMD',
    company: 'GSEC Bird Airport Services Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '24AAICG9289Q1ZK',
  },
  {
    cityAliases: ['Lucknow'],
    stationCode: 'LKO',
    company: 'GSEC Bird Airport Services Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '09AAICG9289Q1ZC',
  },
  {
    cityAliases: ['Mangalore', 'Mangaluru'],
    stationCode: 'IXE',
    company: 'GSEC Bird Airport Services Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '29AAICG9289Q1ZA',
  },
  {
    cityAliases: ['Trivandrum', 'Thiruvananthapuram'],
    stationCode: 'TRV',
    company: 'GSEC Bird Airport Services Pvt. Ltd.',
    street: 'E9, Connaught House, Connaught Place, India',
    addressCity: 'New Delhi',
    country: 'India',
    pincode: '110001',
    gstNumber: '24AAICG9289Q1ZK',
  },
  {
    cityAliases: ['Trichy', 'Tiruchirappalli', 'Tiruchirapalli'],
    stationCode: 'TRZ',
    company: 'Bird Airport Services (Trichy) Pvt. Ltd.',
    street: 'Old Terminal Building, Tiruchirappalli International Airport',
    addressCity: 'Trichy',
    country: 'India',
    pincode: '620007',
    gstNumber: '33AAKKCB2024Q1ZL',
  },
  {
    cityAliases: ['Coimbatore'],
    stationCode: 'CJB',
    company: 'Bird Airport Services (Coimbatore) Pvt. Ltd.',
    street: 'Air Cargo Complex, Coimbatore International Airport',
    addressCity: 'Coimbatore - Tamil Nadu',
    country: 'India',
    pincode: '641014',
    gstNumber: '33AAKCB1955A1Z4',
  },
  {
    cityAliases: ['Imphal'],
    stationCode: 'IMF',
    company: 'Bird Airport Services (Imphal) Pvt. Ltd.',
    street:
      'Room #49, Departure Hall, Imphal International Airport, West Imphal - 795140, Manipur, India',
    addressCity: 'Imphal',
    country: 'India',
    pincode: '795140',
    gstNumber: '14AAKCB1935G1ZW',
  },
  {
    cityAliases: ['Agartala'],
    stationCode: 'IXA',
    company: 'Bird Airport Services (Agartala) Pvt. Ltd.',
    street:
      'Maharaja Bir Bikram Airport, Agartala West, Agartala - 799009, Tripura, India',
    addressCity: 'Agartala',
    country: 'India',
    pincode: '799009',
    gstNumber: '16AAKCB1860E1ZW',
  },
  {
    cityAliases: ['Goa', 'Dabolim'],
    stationCode: 'GOI',
    company: 'Bird Airport Services (Konkan) Pvt. Ltd.',
    street: 'C5 - 4, Green Meadows, Dabolim, Goa - 403801, India',
    addressCity: 'Dabolim, Goa',
    country: 'India',
    pincode: '403801',
    gstNumber: '30AAJCB5932E1Z2',
  },
  {
    cityAliases: ['Chandigarh', 'Mohali'],
    stationCode: 'IXC',
    company: 'Bird Airport Services (Mohali) Pvt. Ltd.',
    street:
      'Room no 5, Departure upper area, New Civil Terminal, Chandigarh International Airport, Jheuheri village, Mohali, Punjab, India',
    addressCity: 'Mohali, Punjab',
    country: 'India',
    pincode: '140307',
    gstNumber: '03AAJCB7598L1Z2',
  },
  {
    cityAliases: ['Chennai', 'Madras'],
    stationCode: 'MAA',
    company: 'Bird Airport Services (Chennai) Private Limited',
    street:
      'Domestic Terminal, New Domestic Terminal(T1), Chennai Airport, Chennai-600016',
    addressCity: 'Chennai',
    country: 'India',
    pincode: '600016',
    gstNumber: '33AALCB3911H1ZX',
  },
];

function norm(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function findStationLegalDetails(input: {
  stationCode?: string | null;
  code?: string | null;
  city?: string | null;
}): StationLegalDetails | undefined {
  const stationCode = norm(input.stationCode);
  const codePrefix = norm(input.code).split('-')[0] ?? '';
  const city = norm(input.city);

  return STATION_LEGAL_DETAILS.find((row) => {
    const code = norm(row.stationCode);
    if (stationCode && stationCode === code) return true;
    if (codePrefix && codePrefix === code) return true;
    return row.cityAliases.some((alias) => norm(alias) === city);
  });
}

/** Fields applied onto AdminStation documents (does not overwrite ops `city`). */
export function legalDetailsPatch(details: StationLegalDetails) {
  return {
    company: details.company,
    street: details.street,
    addressCity: details.addressCity,
    country: details.country,
    pincode: details.pincode,
    gstNumber: details.gstNumber,
  };
}
