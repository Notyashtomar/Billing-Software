'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getRampShiftReport } from '@/lib/api';
import type { RampShiftReportPayload } from '@/lib/api';
import { displayRampPersonName, payloadToFormSnapshot } from '@/components/fris/reports/rampShiftStorage';
import {
  scheduledRowsForReport,
} from '@/components/fris/reports/rampScheduledMappers';
import type { NonScheduledAirlineTableRow } from '@/components/fris/reports/rampNonScheduledMappers';
import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';
import { formatRampFlightCellDisplay } from '@/components/fris/reports/rampDisplayFormat';
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/richText';
import { rampReport as r } from '@/components/fris/reports/rampShiftReportPlainUi';
import { useStationCompanyLogo } from '@/hooks/useStationCompanyLogo';
import {
  RAMP_FLIGHT_ROW_KEYS,
  RAMP_RESOURCE_COL_GROUPS,
  RAMP_RESOURCE_COLUMN_META,
  RAMP_RESOURCE_DESCRIPTION_ROWS,
  RAMP_RESOURCE_TABLE_COL_COUNT,
  dayOfWeekFromYmd,
  formatYmdToDisplayDate,
  rampResourceGroupRowSpanOnly,
  rampResourceGroupStarts,
  RAMP_FLIGHT_SUB_HEADERS,
  sumIntegerFields,
  type RampFlightRowKey,
} from '@/components/fris/reports/rampShiftReportLayout';

function flightCellRaw(
  row: RampScheduledAirlineRow | NonScheduledAirlineTableRow,
  key: RampFlightRowKey,
): string {
  if (key === 'arrivalEta' && 'arrivalEtaAta' in row) {
    return String(row.arrivalEtaAta ?? '');
  }
  const rec = row as Record<RampFlightRowKey, string | undefined>;
  return String(rec[key] ?? '');
}

function flightRowCells(row: RampScheduledAirlineRow | NonScheduledAirlineTableRow) {
  return RAMP_FLIGHT_ROW_KEYS.map((key) =>
    formatRampFlightCellDisplay(key, flightCellRaw(row, key)),
  );
}

type Props = { reportId: string };

export default function RampShiftReportViewContent({ reportId }: Props) {
  const id = String(reportId ?? '').trim();
  const [payload, setPayload] = useState<RampShiftReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logoPath } = useStationCompanyLogo();

  const reload = useCallback(async () => {
    if (!id) {
      setError('Missing report id.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getRampShiftReport(id);
      setPayload(data);
    } catch (e) {
      setPayload(null);
      setError(e instanceof Error ? e.message : 'Could not load report.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const form = useMemo(
    () => (payload ? payloadToFormSnapshot(payload) : null),
    [payload],
  );

  const scheduledForReport = useMemo(
    () => (form ? scheduledRowsForReport(form.scheduledRows) : []),
    [form],
  );

  const shiftMeta = useMemo(() => {
    if (!payload) return null;
    const isDay = payload.shift === 'day';
    return {
      title: isDay ? 'Day Shift Ramp Services Report' : 'Night Shift Ramp Services Report',
      shiftTime: isDay ? '05:00 - 17:00' : '17:00 - 05:00',
      dateLabel: formatYmdToDisplayDate(payload.reportDateYmd),
      dayOfWeek: dayOfWeekFromYmd(payload.reportDateYmd),
    };
  }, [payload]);

  const indicators = useMemo(() => {
    if (!form) return null;
    const o = form;
    return {
      flight: [
        { label: 'Total Arrivals', value: o.totalArrivals },
        { label: 'Total Departures', value: o.totalDepartures },
        {
          label: 'Total',
          value: sumIntegerFields(o.totalArrivals, o.totalDepartures),
          total: true,
        },
      ],
      paxCargo: [
        { label: 'Pax Flts', value: o.paxFlts },
        { label: 'Cargo Flts', value: o.cargoFlts },
        { label: 'UnScheduled-Pax', value: o.unschedPax },
        { label: 'UnScheduled-Cargo', value: o.unschedCargo },
        {
          label: 'Total',
          value: sumIntegerFields(o.paxFlts, o.cargoFlts, o.unschedPax, o.unschedCargo),
          total: true,
        },
      ],
      delays: [
        { label: 'Accountable', value: o.delayAccountable },
        { label: 'UN - Accountable', value: o.delayUnAccountable },
        {
          label: 'Total',
          value: sumIntegerFields(o.delayAccountable, o.delayUnAccountable),
          total: true,
        },
      ],
      otp: [
        { label: 'Target', value: o.otpTarget },
        { label: 'Actual', value: o.otpActual },
      ],
    };
  }, [form]);

  const resourceGroups = useMemo(() => rampResourceGroupStarts(), []);

  if (!id) {
    return (
      <div className={r.page}>
        <div className={r.maxWidth}>
          <p className={r.panel}>No report id provided.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={r.page}>
      <div className={r.maxWidth}>
        <div className={r.headerBar}>
          <Link href="/fris/reports/ramp-shift" className={r.linkBack}>
            <span className="inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Ramp Shift Report
            </span>
          </Link>
          <div className={r.btnRow}>
            <button type="button" className={r.btn} onClick={() => void reload()} disabled={loading}>
              Refresh
            </button>
            <button
              type="button"
              className={r.btnPrimary}
              onClick={() => {
                void toast.promise(
                  import('@/components/fris/reports/rampShiftReportPdf').then((mod) =>
                    mod.downloadRampShiftReportPdf(id),
                  ),
                  {
                    loading: 'Building PDF…',
                    success: 'PDF downloaded',
                    error: (e) => (e instanceof Error ? e.message : 'Could not generate PDF'),
                  },
                );
              }}
              disabled={!payload || loading}
            >
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-4 w-4" aria-hidden />
                Download PDF
              </span>
            </button>
          </div>
        </div>

        {loading && (
          <div className={r.panel}>
            <span className={r.spinner} aria-hidden /> Loading report…
          </div>
        )}

        {!loading && error && (
          <div className={r.panel}>
            <p className="font-medium text-red-800">{error}</p>
            <button type="button" className={`${r.btn} mt-3`} onClick={() => void reload()}>
              Retry
            </button>
          </div>
        )}

        {!loading && payload && form && shiftMeta && indicators && (
          <>
            <header className={r.reportDocHeader}>
              <Image
                src={logoPath}
                alt="Airport logo"
                width={714}
                height={138}
                className={r.reportDocLogo}
                priority
              />
              <h1 className={r.reportDocTitle}>{shiftMeta.title}</h1>
              <div className={r.reportDocDetails}>
                {(
                  [
                    ['Manager / Duty Manager', displayRampPersonName(form.manager)],
                    ['Date', shiftMeta.dateLabel],
                    ['Shift Time', shiftMeta.shiftTime],
                    ['Day of week', shiftMeta.dayOfWeek],
                    ['Report By', form.reportBy || '—'],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className={r.reportDocDetailRow}>
                    <span className={r.reportDocDetailLabel}>{label}:</span>
                    <span className={r.reportDocDetailValue}>{value}</span>
                  </div>
                ))}
              </div>
            </header>

            <div className={r.sectionBar}>Operational Indicators</div>
            <div className={r.indicatorWrap}>
              <div className={r.indicatorCol}>
                {(
                  [
                    ['Flight', indicators.flight],
                    ['Delays', indicators.delays],
                  ] as const
                ).map(([title, rows]) => (
                  <div key={title} className={r.indicatorBox}>
                    <div className={r.indicatorTitle}>{title}</div>
                    <table className={r.indicatorTable}>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.label}>
                            <th className={r.indicatorTh}>{row.label}</th>
                            <td className={'total' in row && row.total ? r.indicatorTotal : r.indicatorTd}>
                              {row.value || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <div className={r.indicatorCol}>
                {(
                  [
                    ['Pax / Cargo', indicators.paxCargo],
                    ['OTP', indicators.otp],
                  ] as const
                ).map(([title, rows]) => (
                  <div key={title} className={r.indicatorBox}>
                    <div className={r.indicatorTitle}>{title}</div>
                    <table className={r.indicatorTable}>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.label}>
                            <th className={r.indicatorTh}>{row.label}</th>
                            <td className={'total' in row && row.total ? r.indicatorTotal : r.indicatorTd}>
                              {row.value || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>

            <div className={r.tableWrap}>
              <table className={r.table}>
                <thead>
                  <tr>
                    <th colSpan={RAMP_RESOURCE_TABLE_COL_COUNT} className={r.resourcesTitleTh}>
                      Summary of Resources
                    </th>
                  </tr>
                  <tr>
                    <th rowSpan={2} className={r.descTh}>
                      Description
                    </th>
                    {resourceGroups.map((g, gi) => {
                      const group = RAMP_RESOURCE_COL_GROUPS[gi]!;
                      const rowSpan = rampResourceGroupRowSpanOnly(group) ? 2 : undefined;
                      return (
                        <th
                          key={g.title}
                          colSpan={g.colSpan}
                          rowSpan={rowSpan}
                          className={r.th}
                        >
                          {g.title}
                        </th>
                      );
                    })}
                  </tr>
                  <tr>
                    {RAMP_RESOURCE_COL_GROUPS.flatMap((group) =>
                      rampResourceGroupRowSpanOnly(group)
                        ? []
                        : group.subHeaders.map((sub, si) => (
                            <th key={`${group.title}-${si}`} className={r.resourcesSubTh}>
                              {sub || '\u00a0'}
                            </th>
                          )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {RAMP_RESOURCE_DESCRIPTION_ROWS.map((label, ri) => (
                    <tr key={label}>
                      <th className={r.descTd}>{label}</th>
                      {RAMP_RESOURCE_COLUMN_META.map((_, c) => (
                        <td key={c} className={ri % 2 === 0 ? r.resourcesTd : r.resourcesTdAlt}>
                          {form.resourceValues[ri]?.[c] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={r.sectionBar}>Scheduled Airlines</div>
            <div className={r.tableWrap}>
              <table className={r.table}>
                <thead>
                  <tr>
                    <th rowSpan={2} className={r.th}>
                      Airline
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Flt no
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Report no
                    </th>
                    <th colSpan={2} className={r.th}>
                      Bay
                    </th>
                    <th colSpan={3} className={r.th}>
                      Arrivals
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Hold open
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Hold close
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff ATA-1st BAG
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff 1st BAG
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff last BAG
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff LB-ATA
                    </th>
                    <th colSpan={3} className={r.th}>
                      Departure
                    </th>
                    <th colSpan={4} className={r.th}>
                      Delay
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Supvr name
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Team at bay
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Last cargo lot
                    </th>
                    <th colSpan={2} className={r.th}>
                      Baggage count
                    </th>
                  </tr>
                  <tr>
                    {RAMP_FLIGHT_SUB_HEADERS.map((col) => (
                      <th key={`scheduled-${col.id}`} className={r.th}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduledForReport.length === 0 ? (
                    <tr>
                      <td colSpan={26} className={r.empty}>
                        {form.scheduledRows.length === 0
                          ? 'No scheduled flights saved on this report.'
                          : 'No flights are checked and authorized. On the edit form, select rows under Authorize, click Authorize All, save the report, then view again.'}
                      </td>
                    </tr>
                  ) : (
                    scheduledForReport.map((row, i) => (
                      <tr key={row.id || i}>
                        {flightRowCells(row).map((val, ci) => (
                          <td key={ci} className={r.tdGreen}>
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={r.sectionBar}>Non-Scheduled Airlines</div>
            <div className={r.tableWrap}>
              <table className={r.table}>
                <thead>
                  <tr>
                    <th rowSpan={2} className={r.th}>
                      Airline
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Flt no
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Report no
                    </th>
                    <th colSpan={2} className={r.th}>
                      Bay
                    </th>
                    <th colSpan={3} className={r.th}>
                      Arrivals
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Hold open
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Hold close
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff ATA-1st BAG
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff 1st BAG
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff last BAG
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Diff LB-ATA
                    </th>
                    <th colSpan={3} className={r.th}>
                      Departure
                    </th>
                    <th colSpan={4} className={r.th}>
                      Delay
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Supvr name
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Team at bay
                    </th>
                    <th rowSpan={2} className={r.th}>
                      Last cargo lot
                    </th>
                    <th colSpan={2} className={r.th}>
                      Baggage count
                    </th>
                  </tr>
                  <tr>
                    {RAMP_FLIGHT_SUB_HEADERS.map((col) => (
                      <th key={`non-scheduled-${col.id}`} className={r.th}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.nonScheduledRows.length === 0 ? (
                    <tr>
                      <td colSpan={26} className={r.empty}>
                        No non-scheduled flights for this report.
                      </td>
                    </tr>
                  ) : (
                    form.nonScheduledRows.map((row, i) => (
                      <tr key={`ns-${i}`}>
                        {flightRowCells(row).map((val, ci) => (
                          <td key={ci} className={r.td}>
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={r.notesGrid}>
              <div className={r.notesBox}>
                <div className={r.notesTitle}>
                  Operational Performance : Appreciations / Observations / Suggestions
                </div>
                {isRichTextEmpty(form.operationalNotes) ? (
                  <div className={r.notesBody}>—</div>
                ) : (
                  <div
                    className={`${r.notesBody} rte-content`}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(form.operationalNotes) }}
                  />
                )}
              </div>
              <div className={r.notesBox}>
                <div className={r.notesTitle}>Irregularities : Staff Issues / Safety / Compliance</div>
                {isRichTextEmpty(form.irregularitiesNotes) ? (
                  <div className={r.notesBody}>—</div>
                ) : (
                  <div
                    className={`${r.notesBody} rte-content`}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(form.irregularitiesNotes) }}
                  />
                )}
              </div>
            </div>

            <p className="text-center text-[10px] text-neutral-500 print:mt-2">
              Report ID: {payload.reportId} · Modified by {payload.modifiedBy || '—'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
