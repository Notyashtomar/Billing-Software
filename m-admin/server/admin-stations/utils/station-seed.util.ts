import {
  findStationLegalDetails,
  legalDetailsPatch,
} from './station-legal-details.util';

type StationRegion =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'Central'
  | 'International';

type StationStatus = 'Active' | 'Maintenance' | 'Delayed' | 'Offline';

type AirportSeed = {
  city: string;
  stationCode: string;
  company: string;
  airport: string;
  lat: number;
  lon: number;
  image: string;
};

const AIRPORTS: AirportSeed[] = [
  { city: 'Delhi', stationCode: 'DEL', company: 'Bird Flight Services (India) Pvt. Ltd.', airport: 'Indira Gandhi International Airport', lat: 28.5562, lon: 77.1, image: '/airportimage/delhi.jpg' },
  { city: 'Juhu', stationCode: 'VAJJ', company: 'Bird Flight Services (India) Pvt. Ltd.', airport: 'Juhu Aerodrome', lat: 19.099, lon: 72.8267, image: '/airportimage/juhu.jpg' },
  { city: 'Mumbai', stationCode: 'BOM', company: 'Bird Airport Service Mumbai Pvt. Ltd.', airport: 'Chhatrapati Shivaji Maharaj International Airport', lat: 19.0896, lon: 72.8656, image: '/airportimage/mumbai.jpg' },
  { city: 'Bengaluru', stationCode: 'BLR', company: 'GlobeGround India Pvt. Ltd.', airport: 'Kempegowda International Airport', lat: 13.1986, lon: 77.7066, image: '/airportimage/bengaluru.jpg' },
  { city: 'Hyderabad', stationCode: 'HYD', company: 'GlobeGround India Pvt. Ltd.', airport: 'Rajiv Gandhi International Airport', lat: 17.2403, lon: 78.4294, image: '/airportimage/hyderabad.jpg' },
  { city: 'Ahmedabad', stationCode: 'AMD', company: 'GSEC Bird Airport Services Pvt. Ltd.', airport: 'Sardar Vallabhbhai Patel International Airport', lat: 23.0772, lon: 72.6347, image: '/airportimage/ahmedabad.jpg' },
  { city: 'Lucknow', stationCode: 'LKO', company: 'GSEC Bird Airport Services Pvt. Ltd.', airport: 'Chaudhary Charan Singh International Airport', lat: 26.7606, lon: 80.8893, image: '/airportimage/lucknow.jpg' },
  { city: 'Mangalore', stationCode: 'IXE', company: 'GSEC Bird Airport Services Pvt. Ltd.', airport: 'Mangalore International Airport', lat: 12.9613, lon: 74.8901, image: '/airportimage/mangalore.jpg' },
  { city: 'Chennai', stationCode: 'MAA', company: 'Bird Airport Services (Chennai) Private Limited', airport: 'Chennai International Airport', lat: 12.9941, lon: 80.1709, image: '/airportimage/chennai.jpg' },
  { city: 'Kochi', stationCode: 'COK', company: 'Bird Flight Services (India) Pvt. Ltd.', airport: 'Cochin International Airport', lat: 10.152, lon: 76.4019, image: '/airportimage/kochi.jpg' },
  { city: 'Trivandrum', stationCode: 'TRV', company: 'GSEC Bird Airport Services Pvt. Ltd.', airport: 'Thiruvananthapuram International Airport', lat: 8.4821, lon: 76.92, image: '/airportimage/trivandrum.jpg' },
  { city: 'Trichy', stationCode: 'TRZ', company: 'Bird Airport Services (Trichy) Pvt. Ltd.', airport: 'Tiruchirappalli International Airport (TRZ)', lat: 10.7654, lon: 78.7097, image: '/airportimage/trichy.jpg' },
  { city: 'Coimbatore', stationCode: 'CJB', company: 'Bird Airport Services (Coimbatore) Pvt. Ltd.', airport: 'Coimbatore International Airport', lat: 11.03, lon: 77.0434, image: '/airportimage/coimbatore.jpg' },
  { city: 'Imphal', stationCode: 'IMF', company: 'Bird Airport Services (Imphal) Pvt. Ltd.', airport: 'Imphal International Airport', lat: 24.76, lon: 93.8967, image: '/airportimage/imphal.jpg' },
  { city: 'Agartala', stationCode: 'IXA', company: 'Bird Airport Services (Agartala) Pvt. Ltd.', airport: 'Maharaja Bir Bikram Airport', lat: 23.8869, lon: 91.2404, image: '/airportimage/agartala.jpg' },
  { city: 'Goa', stationCode: 'GOI', company: 'Bird Airport Services (Konkan) Pvt. Ltd.', airport: 'Goa International Airport', lat: 15.3808, lon: 73.8314, image: '/airportimage/goa.jpg' },
  { city: 'Chandigarh', stationCode: 'IXC', company: 'Bird Airport Services (Mohali) Pvt. Ltd.', airport: 'Chandigarh International Airport', lat: 30.6733, lon: 76.7885, image: '/airportimage/chandigarh.jpg' },
  { city: 'Noida', stationCode: 'DXN', company: 'Bird Flight Services (India) Pvt. Ltd.', airport: 'Noida International Airport', lat: 28.547, lon: 77.5946, image: '/airportimage/noida.jpg' },
  { city: 'Agra', stationCode: 'AGR', company: 'Bird Flight Services (India) Pvt. Ltd.', airport: 'Agra Airport', lat: 27.1577, lon: 77.9609, image: '/airportimage/agra.jpg' },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rand(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function toRegion(lat: number, lon: number): StationRegion {
  if (lon > 85) return 'East';
  if (lon < 74) return 'West';
  if (lat > 26) return 'North';
  if (lat < 14) return 'South';
  return 'Central';
}

function insightFor(status: StationStatus, eff: number, delayed: number) {
  if (status === 'Maintenance') return 'Maintenance required ⚠️';
  if (status === 'Offline') return 'Station offline — action needed 🛑';
  if (status === 'Delayed' || delayed > 10) return 'Delay rate increased today 📈';
  if (eff >= 86) return 'High traffic detected 🚀';
  return 'Operations running smoothly ✅';
}

export function buildAdminStationsSeed() {
  return AIRPORTS.map((a, idx) => {
    const statusRoll = rand((idx + 1) * 7);
    const status: StationStatus =
      statusRoll > 0.92
        ? 'Offline'
        : statusRoll > 0.82
          ? 'Maintenance'
          : statusRoll > 0.68
            ? 'Delayed'
            : 'Active';
    const base = 70 + Math.round(rand((idx + 1) * 11) * 28);
    const weeklyPerf = Array.from({ length: 7 }, (_, d) =>
      clamp(
        base +
          Math.round(10 * Math.sin((idx + 1 + d) * 0.55)) +
          Math.round(rand((idx + 1) * 91 + d * 3) * 8 - 4),
        40,
        98,
      ),
    );
    const eff = clamp(
      Math.round(weeklyPerf.reduce((s, v) => s + v, 0) / weeklyPerf.length),
      35,
      98,
    );
    const delayedOps =
      status === 'Delayed'
        ? 10 + Math.round(rand((idx + 1) * 29) * 18)
        : Math.round(rand((idx + 1) * 29) * 9);

    const legal = findStationLegalDetails({
      stationCode: a.stationCode,
      city: a.city,
    });
    const legalPatch = legal ? legalDetailsPatch(legal) : null;

    return {
      name: a.airport,
      code: `${a.stationCode}-${String((idx % 3) + 1).padStart(2, '0')}`,
      stationCode: a.stationCode,
      company: legalPatch?.company ?? a.company,
      region: toRegion(a.lat, a.lon),
      city: a.city,
      street: legalPatch?.street,
      addressCity: legalPatch?.addressCity,
      country: legalPatch?.country ?? 'India',
      pincode: legalPatch?.pincode,
      gstNumber: legalPatch?.gstNumber,
      zone: `Terminal ${(idx % 3) + 1}`,
      type: idx % 5 === 0 ? 'Cargo' : 'Airport',
      manager: ['A. Sharma', 'R. Verma', 'N. Singh', 'K. Iyer', 'S. Khan'][idx % 5]!,
      capacity: 500 + Math.round(rand((idx + 1) * 37) * 2400),
      status,
      notes: '',
      photoUrl: a.image,
      dailyOps: 140 + Math.round(rand((idx + 1) * 19) * 540),
      activeStaff: 18 + Math.round(rand((idx + 1) * 31) * 64),
      departmentCount: 4 + (idx % 4),
      efficiencyPct: eff,
      delayedOps,
      weeklyPerf,
      throughputMonth: Array.from({ length: 12 }, (_, m) =>
        clamp(
          55 +
            Math.round(rand((idx + 1) * 47 + m * 13) * 42) +
            Math.round(8 * Math.sin(m * 0.6 + (idx + 1) * 0.2)),
          25,
          98,
        ),
      ),
      insight: insightFor(status, eff, delayedOps),
    };
  });
}
