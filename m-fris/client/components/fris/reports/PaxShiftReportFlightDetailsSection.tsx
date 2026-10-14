'use client';

import { useMemo } from 'react';
import {
  ADDITIONAL_INFO_HEADERS,
  ARRIVAL_MHB_HEADERS,
  buildAdditionalInfoRow,
  buildArrivalMhbRow,
  buildDelayCodeRows,
  buildFlightDetailsTimesRow,
  buildCompiledByRow,
  buildLevel4Row,
  briefHandlingDescription,
  COMPILED_BY_HEADERS,
  FLIGHT_DETAILS_TIMES_HEADERS,
  LEVEL4_HEADERS,
  transposePaxReportTable,
  transposeWideTable,
} from '@/components/fris/reports/paxShiftReportFlightDetailsLayout';
import { paxShiftReportPlain as r } from '@/components/fris/reports/paxShiftReportPlainUi';

import type { FlightHandlingFieldMap } from '@/components/fris/reports/paxShiftReportFlightDetailsLayout';

type Props = { flightHandling: FlightHandlingFieldMap };

function VerticalMetricTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <table className={r.table}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} className={`${r.th} ${h === 'Field' ? 'min-w-[10rem]' : ''}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} className={`${r.td} ${ci === 0 ? 'font-medium' : ''}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PaxShiftReportFlightDetailsSection({ flightHandling }: Props) {
  const fh = flightHandling ?? {};
  const paxVertical = useMemo(() => transposePaxReportTable(fh), [flightHandling]);
  const mhbVertical = useMemo(
    () => transposeWideTable(ARRIVAL_MHB_HEADERS, [buildArrivalMhbRow(fh)]),
    [flightHandling],
  );
  const addInfoVertical = useMemo(
    () => transposeWideTable(ADDITIONAL_INFO_HEADERS, [buildAdditionalInfoRow(fh)]),
    [flightHandling],
  );

  return (
    <section>
      <h2 className={r.sectionTitle}>Flight Details</h2>

      <div className={r.tableWrap}>
        <table className={r.table}>
          <thead>
            <tr>
              {FLIGHT_DETAILS_TIMES_HEADERS.map((h) => (
                <th key={h} className={r.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {buildFlightDetailsTimesRow(fh).map((v, i) => (
                <td key={i} className={r.td}>
                  {v}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className={r.blockLabel}>Delay Code &amp; Description</p>
      <div className={r.tableWrap}>
        <table className={r.table}>
          <thead>
            <tr>
              <th className={r.th}>Delay Code &amp; Description</th>
              <th className={`${r.th} w-16`}>Min</th>
            </tr>
          </thead>
          <tbody>
            {buildDelayCodeRows(fh).map((row, ri) => (
              <tr key={ri}>
                <td className={r.td}>{row[0]}</td>
                <td className={r.td}>{row[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={r.blockLabel}>Passenger / Transit pax / Baggage count</p>
      <div className={r.tableWrap}>
        <VerticalMetricTable headers={paxVertical.headers} rows={paxVertical.rows} />
      </div>

      <p className={r.blockLabel}>Level-4 Bags</p>
      <div className={r.tableWrap}>
        <table className={r.table}>
          <thead>
            <tr>
              {LEVEL4_HEADERS.map((h) => (
                <th key={h} className={r.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {buildLevel4Row(fh).map((v, i) => (
                <td key={i} className={r.td}>
                  {v}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className={r.blockLabel}>Arrival MHB &amp; baggage</p>
      <div className={r.tableWrap}>
        <VerticalMetricTable headers={mhbVertical.headers} rows={mhbVertical.rows} />
      </div>

      <p className={r.blockLabel}>Additional Info</p>
      <div className={r.tableWrap}>
        <VerticalMetricTable headers={addInfoVertical.headers} rows={addInfoVertical.rows} />
      </div>

      <p className={r.blockLabel}>Brief description of flight handling</p>
      <div className={`${r.tableWrap} ${r.proseBox}`}>{briefHandlingDescription(fh)}</div>

      <p className={r.blockLabel}>Report compiled by</p>
      <div className={r.tableWrap}>
        <table className={r.table}>
          <thead>
            <tr>
              {COMPILED_BY_HEADERS.map((h) => (
                <th key={h} className={r.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {buildCompiledByRow(fh).map((v, i) => (
                <td key={i} className={r.td}>
                  {v}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
