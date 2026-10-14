import type { Flight } from '@/types/flight';

function formatDmy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
// gg
function eachCalendarDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const SCHEDULED_AIRLINES = [
  'IndiGo',
  'Air India Express',
  'SpiceJet',
  'Akasa Air',
  'Vistara',
];
const NS_OPERATORS = ['Sky Charter Ltd', 'Apex Air Services', 'Cargo Wings Pvt Ltd'];

const TIME_SLOTS: { sta: string; std: string }[] = [
  { sta: '06:30', std: '07:20' },
  { sta: '08:45', std: '09:35' },
  { sta: '11:10', std: '12:05' },
  { sta: '14:00', std: '14:50' },
  { sta: '17:25', std: '18:15' },
  { sta: '20:40', std: '21:30' },
];

const PRIMARY_IATA_CODES = [
  '93', '41', '68', '12', '36', '11', '06', '32', '71', '81', '16', '43', '15', '38', '21', '34',
];
const SECONDARY_IATA_CODES = ['17', '25', '39', '48', '51', '62', '77', '89'];

export function buildDashboardMockFlights(
  range: { startDate: Date; endDate: Date },
  mode: 'scheduled' | 'non-scheduled',
): Flight[] {
  const days = eachCalendarDay(range.startDate, range.endDate);
  const list: Flight[] = [];
  let serial = mode === 'scheduled' ? 900_001 : 800_001;
  const perDay = mode === 'scheduled' ? 6 : 4;

  const push = (row: Flight) => {
    list.push(row);
    serial += 1;
  };

  days.forEach((day, dayIdx) => {
    const staDate = formatDmy(day);
    const stdDate = staDate;

    for (let i = 0; i < perDay; i++) {
      const seed = dayIdx * perDay + i;
      const slot = TIME_SLOTS[seed % TIME_SLOTS.length];
      const airline =
        mode === 'scheduled'
          ? SCHEDULED_AIRLINES[seed % SCHEDULED_AIRLINES.length]
          : NS_OPERATORS[seed % NS_OPERATORS.length];
      const flightNo =
        mode === 'scheduled'
          ? `${seed % 2 === 0 ? '6E' : 'IX'} ${2100 + (seed % 80)}`
          : `NS-${String(100 + seed).slice(-3)}`;

      const typeofflight =
        mode === 'scheduled'
          ? seed % 5 === 0
            ? 'Ramp Handling Only'
            : 'Turnaround'
          : seed % 3 === 0
            ? 'Charter'
            : 'Turnaround';

      const roll = seed % 10;

      const base: Omit<Flight, 'ATATime' | 'ATADate' | 'ATDTime' | 'ATDDate' | 'Delay'> &
        Record<string, unknown> = {
        SerialNo: serial,
        Airline: airline,
        FlightNo: flightNo,
        Typeofflight: typeofflight,
        TypeCraft: mode === 'scheduled' ? 'Boeing 737' : 'Non-Scheduled',
        STATime: slot.sta,
        STADate: staDate,
        STDTime: slot.std,
        STDDate: stdDate,
        ETDtime: slot.std,
        ETDdate: stdDate,
        RateingValue: seed % 4 === 0 ? 'Good' : 'Satisfactory',
        'Cancelled data': '',
        'Count Cancelled FLIGHT': 0,
        'Delay flight': 0,
        'Delay flight ': 0,
      };

      if (roll === 0) {
        push({
          ...base,
          FlightNo: `${flightNo}-CANC`,
          'Cancelled data': 'CANC - operational',
          ATATime: '',
          ATADate: '',
          ATDTime: '',
          ATDDate: '',
          Delay: undefined,
        } as Flight);
        continue;
      }

      if (roll === 1 || roll === 6) {
        const [sh, sm] = slot.sta.split(':').map(Number);
        const ataTotal = sh * 60 + sm - 12;
        const atatime = `${String(Math.floor(ataTotal / 60)).padStart(2, '0')}:${String(ataTotal % 60).padStart(2, '0')}`;
        const [dh, dm] = slot.std.split(':').map(Number);
        const atdTotal = dh * 60 + dm - 14;
        const atdtime = `${String(Math.floor(atdTotal / 60)).padStart(2, '0')}:${String(atdTotal % 60).padStart(2, '0')}`;
        push({
          ...base,
          ATATime: atatime,
          ATADate: staDate,
          ATDTime: atdtime,
          ATDDate: stdDate,
          Delay: 'On Time',
          'Delay flight': 0,
          'Delay flight ': 0,
        } as Flight);
        continue;
      }

      if (roll === 5) {
        const [sh, sm] = slot.sta.split(':').map(Number);
        const ataTotal = sh * 60 + sm - 25;
        const atatime = `${String(Math.floor(ataTotal / 60)).padStart(2, '0')}:${String(ataTotal % 60).padStart(2, '0')}`;
        const [dh, dm] = slot.std.split(':').map(Number);
        const atdTotal = dh * 60 + dm - 20;
        const atdtime = `${String(Math.floor(atdTotal / 60)).padStart(2, '0')}:${String(atdTotal % 60).padStart(2, '0')}`;
        push({
          ...base,
          ATATime: atatime,
          ATADate: staDate,
          ATDTime: atdtime,
          ATDDate: stdDate,
          Delay: 'Before Time',
          'Delay flight': 0,
          'Delay flight ': 0,
        } as Flight);
        continue;
      }

      const code = PRIMARY_IATA_CODES[seed % PRIMARY_IATA_CODES.length];
      const [sh, sm] = slot.sta.split(':').map(Number);
      const lateArr = sh * 60 + sm + 22;
      const ataH = Math.floor(lateArr / 60);
      const ataMin = lateArr % 60;
      const atatime = `${String(ataH).padStart(2, '0')}:${String(ataMin).padStart(2, '0')}`;
      const [dh, dm] = slot.std.split(':').map(Number);
      const lateDep = dh * 60 + dm + 35;
      const atdH = Math.floor(lateDep / 60);
      const atdMin = lateDep % 60;
      const atdtime = `${String(atdH).padStart(2, '0')}:${String(atdMin).padStart(2, '0')}`;

      const extra: Record<string, unknown> = {
        'Delay reason': `Primary DL: ${code}`,
        'Primary delay code': code,
        ActualDelay: '00:35',
      };

      if (seed % 3 === 0) {
        const sec = SECONDARY_IATA_CODES[seed % SECONDARY_IATA_CODES.length];
        extra['Secondary delay code'] = `Code ${sec}`;
        extra['IATA subcode'] = sec;
      }

      push({
        ...base,
        ...extra,
        ATATime: atatime,
        ATADate: staDate,
        ATDTime: atdtime,
        ATDDate: stdDate,
        Delay: 'Delay',
        'Delay flight': 1,
        'Delay flight ': 1,
      } as Flight);
    }
  });

  return list;
}
