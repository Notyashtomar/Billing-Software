import type { FlightData } from '@/utils/dataProcessor';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';
import type { PaxShiftReportGathered } from '@/components/fris/reports/paxShiftReportData';
import {
  buildAdditionalInfoRow,
  buildArrivalMhbRow,
  buildDelayCodeRows,
  buildFlightDetailsTimesRow,
  buildCompiledByRow,
  buildLevel4Row,
  buildPaxRow,
  briefHandlingDescription,
} from '@/components/fris/reports/paxShiftReportFlightDetailsLayout';
import {
  buildRosterLeaveTableBody,
  buildStaffDetailsTableBody,
  buildSupTlOnDutyRow,
  flightHandlingField,
  paxShiftReportFlightDate,
  paxShiftReportFlightLockDisplay,
} from '@/components/fris/reports/paxShiftReportTableModel';

/** Plain-text body for `mailto:` (length-capped for client URL limits). */
export function buildPaxShiftReportMailBody(flight: FlightData, data: PaxShiftReportGathered, maxLen = 2200): string {
  const ser = displayFlightInstanceSerial(flight.slNo);
  const fh = data.flightHandling;
  const lines: string[] = [
    'PAX SHIFT REPORT (summary)',
    '---',
    `Airline: ${flight.airline || '—'}  Flight: ${flight.flightNo || '—'}  Flight lock: ${paxShiftReportFlightLockDisplay(flight)}  Date: ${paxShiftReportFlightDate(flight, fh)}  FHR No.: ${ser || '—'}`,
    '',
    '--- Staff On Duty (Sup/TL) ---',
  ];
  const sup = buildSupTlOnDutyRow(data);
  lines.push(`${sup.detail} | count: ${sup.count} | ${sup.names}`);
  lines.push('', 'Staff rostered/Duty (Details | No. | Names)');
  for (const r of buildRosterLeaveTableBody(data)) {
    lines.push(`  ${r.detail} | ${r.count} | ${r.names}`);
  }
  lines.push('', 'Staff Details');
  for (const r of buildStaffDetailsTableBody(data)) {
    lines.push(`  ${r.detail} | ${r.count} | ${r.names}`);
  }
  lines.push(
    '',
    'UH counter | Overtime reason | Staff of overtime',
    `${flightHandlingField(fh, 'uhCounters') || '—'} | ${flightHandlingField(fh, 'overtimeReason') || '—'} | ${flightHandlingField(fh, 'staffOvertime') || '—'}`,
  );

  lines.push('', '--- Short shipped bag ---', `No. of bags: ${data.shortShipped.noOfBags || '—'}`);
  if (data.shortShipped.rows.length === 0) lines.push('(no detail rows)');
  else {
    data.shortShipped.rows.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.optionSection || '—'} — ${r.remarks || '—'}`);
    });
  }

  lines.push('', '--- Flight Details (saved) ---');
  if (!fh || Object.keys(fh).length === 0) {
    lines.push('(none — save Flight Details in the Pax shift sidebar.)');
  } else {
    lines.push(`Times row: ${buildFlightDetailsTimesRow(fh).join(' | ')}`);
    buildDelayCodeRows(fh).forEach((r, i) => lines.push(`  Delay ${i + 1}: ${r[0]} | Min: ${r[1]}`));
    lines.push(`  Pax arrival: ${buildPaxRow(fh, 'arrivals').join(' | ')}`);
    lines.push(`  Pax departure: ${buildPaxRow(fh, 'departures').join(' | ')}`);
    lines.push(`  Level-4: ${buildLevel4Row(fh).join(' | ')}`);
    lines.push(`  Arrival MHB row: ${buildArrivalMhbRow(fh).join(' | ')}`);
    lines.push(`  Additional info: ${buildAdditionalInfoRow(fh).join(' | ')}`);
    const brief = briefHandlingDescription(fh);
    if (brief !== '—') lines.push(`  Brief: ${brief.slice(0, 400)}${brief.length > 400 ? '…' : ''}`);
    const [by, desig, d] = buildCompiledByRow(fh);
    lines.push(`  Compiled by: ${by} | Designation: ${desig} | Date: ${d}`);
  }

  const body = lines.join('\n');
  return body.length > maxLen ? `${body.slice(0, maxLen - 1)}…` : body;
}

export function buildPaxShiftReportMailtoHref(flight: FlightData, data: PaxShiftReportGathered): string {
  const ser = displayFlightInstanceSerial(flight.slNo);
  const subject = `Pax Shift Report — ${flight.flightNo || 'Flight'} (${ser})`;
  const body = buildPaxShiftReportMailBody(flight, data);
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
