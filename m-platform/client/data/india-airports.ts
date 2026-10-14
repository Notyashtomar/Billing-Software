/**
 * Airport / station list used by the landing globe ({@link EarthScene}) and admin forms.
 * Keep in sync with the landing experience.
 */
export type IndiaAirportRecord = {
  city: string;
  stationCode: string;
  company: string;
  airport: string;
  lat: number;
  lon: number;
  image: string;
  plotLat?: number;
  plotLon?: number;
};

export const INDIA_AIRPORTS: IndiaAirportRecord[] = [
  {
    city: 'Delhi',
    stationCode: 'DEL',
    company: 'Bird Flight Services Private Limited',
    airport: 'Indira Gandhi International Airport',
    lat: 28.5562,
    lon: 77.1,
    image: '/airportimage/delhi.jpg',
  },
  {
    city: 'Juhu',
    stationCode: 'VAJJ',
    company: 'Bird Flight Services Private Limited',
    airport: 'Juhu Aerodrome',
    lat: 19.099,
    lon: 72.8267,
    image: '/airportimage/juhu.jpg',
  },
  {
    city: 'Bengaluru',
    stationCode: 'BLR',
    company: 'Globe Ground India Private Limited',
    airport: 'Kempegowda International Airport',
    lat: 13.1986,
    lon: 77.7066,
    image: '/airportimage/bengaluru.jpg',
  },
  {
    city: 'Hyderabad',
    stationCode: 'HYD',
    company: 'Globe Ground India Private Limited',
    airport: 'Rajiv Gandhi International Airport',
    lat: 17.2403,
    lon: 78.4294,
    image: '/airportimage/hyderabad.jpg',
  },
  {
    city: 'Chennai',
    stationCode: 'MAA',
    company: 'Bird Airport Services Private Limited',
    airport: 'Chennai International Airport',
    lat: 12.9941,
    lon: 80.1709,
    image: '/airportimage/chennai.jpg',
  },
  {
    city: 'Kochi',
    stationCode: 'COK',
    company: 'Bird Flight Services Private Limited',
    airport: 'Cochin International Airport',
    lat: 10.152,
    lon: 76.4019,
    image: '/airportimage/kochi.jpg',
  },
  {
    city: 'Trivandrum',
    stationCode: 'TRV',
    company: 'GSEC Bird Airport Services Private Limited',
    airport: 'Thiruvananthapuram International Airport',
    lat: 8.4821,
    lon: 76.92,
    image: '/airportimage/trivandrum.jpg',
  },
  {
    city: 'Trichy',
    stationCode: 'TRZ',
    company: 'Bird Airport Services Private Limited',
    airport: 'Tiruchirappalli International Airport (TRZ)',
    lat: 10.7654,
    lon: 78.7097,
    image: '/airportimage/trichy.jpg',
  },
  {
    city: 'Coimbatore',
    stationCode: 'CJB',
    company: 'Bird Airport Services Private Limited',
    airport: 'Coimbatore International Airport',
    lat: 11.03,
    lon: 77.0434,
    image: '/airportimage/coimbatore.jpg',
  },
  {
    city: 'Imphal',
    stationCode: 'IMF',
    company: 'Bird Airport Services Private Limited',
    airport: 'Imphal International Airport',
    lat: 24.76,
    lon: 93.8967,
    image: '/airportimage/imphal.jpg',
  },
  {
    city: 'Agartala',
    stationCode: 'IXA',
    company: 'Bird Airport Services Private Limited',
    airport: 'Maharaja Bir Bikram Airport',
    lat: 23.8869,
    lon: 91.2404,
    image: '/airportimage/agartala.jpg',
  },
  {
    city: 'Goa',
    stationCode: 'GOI',
    company: 'Bird Airport Services Private Limited',
    airport: 'Goa International Airport',
    lat: 15.3808,
    lon: 73.8314,
    image: '/airportimage/goa.jpg',
  },
  {
    city: 'Chandigarh',
    stationCode: 'IXC',
    company: 'Bird Airport Services (Mohali) Pvt. Ltd.',
    airport: 'Chandigarh International Airport',
    lat: 30.6733,
    lon: 76.7885,
    image: '/airportimage/chandigarh.jpg',
  },
  {
    city: 'Noida',
    stationCode: 'DXN',
    company: 'Bird Flight Services Private Limited',
    airport: 'Noida International Airport',
    lat: 28.547,
    lon: 77.5946,
    image: '/airportimage/noida.jpg',
    plotLat: 28.22,
    plotLon: 77.92,
  },
  {
    city: 'Agra',
    stationCode: 'AGR',
    company: 'Bird Flight Services Private Limited',
    airport: 'Agra Airport',
    lat: 27.1577,
    lon: 77.9609,
    image: '/airportimage/agra.jpg',
  },
];

/** Labels for selects — same stations as the landing page globe. */
export const LANDING_STATION_OPTIONS: string[] = INDIA_AIRPORTS.map(
  (a) => `${a.stationCode} — ${a.city}`,
);
