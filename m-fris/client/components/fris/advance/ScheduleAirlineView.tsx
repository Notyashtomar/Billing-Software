'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceDocId,
  fetchScheduleSetupReferenceAirlines,
  fetchAdvanceScheduleSetupMasters,
} from '@/lib/api';
import {
  SCHEDULE_VIEW_FULL_WEEKDAY_NAMES,
  buildScheduleViewRows,
  formatTitleDateUs,
  toTitleCase,
  type ScheduleMasterInput,
} from '@/components/fris/advance/scheduleAirlineViewModel';
import { useStationCompanyLogo } from '@/hooks/useStationCompanyLogo';
import { getSessionStationHeader } from '@/lib/station-company-logo';
import {
  detectCurrentScheduleSeason,
  formatScheduleSeasonTitle,
  previousScheduleSeason,
} from '@/lib/schedule-season';

type AirlineOption = { id: string; name: string; code: string };

function toAirline(doc: Record<string, unknown>): AirlineOption {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(d.name ?? ''),
    code: String(d.code ?? ''),
  };
}

/** Matches company logo assets in `public/` — avoids stretched layout when using Next/Image. */
const LOGO_PX = { width: 714, height: 138 } as const;

/** Yellow weekly totals row — only above the blue column header (not repeated at the bottom). */
function ScheduleTotalsRow({
  footerDayCounts,
  totalWeeklyFlights,
}: {
  footerDayCounts: number[];
  totalWeeklyFlights: number;
}) {
  return (
    <tr className="bg-[#fef08a] font-semibold text-gray-900">
      <td className="border border-gray-300 px-1.5 py-2 text-center" colSpan={5}>
        Weekly No Of Flights(Pax)
      </td>
      {footerDayCounts.map((n, i) => (
        <td key={i} className="border border-gray-300 px-1 py-2 text-center">
          {n}
        </td>
      ))}
      <td className="border border-gray-300 px-1.5 py-2 text-center font-bold" colSpan={2}>
        TOTAL {totalWeeklyFlights} Per week
      </td>
    </tr>
  );
}

export default function ScheduleAirlineView() {
  const searchParams = useSearchParams();
  const airlineId = searchParams.get('airlineId')?.trim() ?? '';
  const companyOverride = searchParams.get('company')?.trim() ?? '';
  const stationLineOverride = searchParams.get('station')?.trim() ?? '';
  const { logoPath } = useStationCompanyLogo();
  const sessionHeader = getSessionStationHeader();

  const [airlines, setAirlines] = useState<AirlineOption[]>([]);
  const [masters, setMasters] = useState<ScheduleMasterInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [seasonChoice, setSeasonChoice] = useState<'current' | 'previous'>('current');
  const currentSeason = useMemo(() => detectCurrentScheduleSeason(), []);
  const previousSeason = useMemo(
    () => previousScheduleSeason(currentSeason),
    [currentSeason],
  );
  const selectedSeason = seasonChoice === 'previous' ? previousSeason : currentSeason;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [airList, rawMasters] = await Promise.all([
        fetchScheduleSetupReferenceAirlines() as Promise<Record<string, unknown>[]>,
        fetchAdvanceScheduleSetupMasters(),
      ]);

      setAirlines(airList.map(toAirline).filter((a) => a.id && (a.name || a.code)));

      const toId = (doc: Record<string, unknown>): string => {
        const rawId = doc._id ?? doc.id;
        if (!rawId) return '';
        if (typeof rawId === 'string') return rawId;
        if (typeof rawId === 'object' && rawId !== null && '$oid' in rawId) return String((rawId as { $oid: string }).$oid);
        if (typeof rawId === 'object' && rawId !== null && 'toString' in rawId) return String((rawId as { toString: () => string }).toString());
        return String(rawId);
      };

      const rows: ScheduleMasterInput[] = (Array.isArray(rawMasters) ? rawMasters : []).map((doc) => {
        const d = doc as Record<string, unknown>;
        return {
          id: toId(d),
          data: (d?.data && typeof d.data === 'object' ? d.data : {}) as Record<string, unknown>,
          serialNo: d?.serialNo ? String(d.serialNo) : undefined,
        };
      });

      setMasters(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule');
      setMasters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const airline = useMemo(
    () => (airlineId ? airlines.find((a) => a.id === airlineId) : undefined),
    [airlines, airlineId],
  );

  /** Default: all airlines. Optional `airlineId` query narrows to one airline. */
  const view = useMemo(() => {
    const options = { seasonKey: selectedSeason.seasonKey };
    if (airlineId && airline?.name?.trim()) {
      return buildScheduleViewRows(masters, airline.name, options);
    }
    return buildScheduleViewRows(masters, '', options);
  }, [masters, airlineId, airline?.name, selectedSeason.seasonKey]);

  const companyName = companyOverride
    ? toTitleCase(companyOverride)
    : sessionHeader.companyName;
  const stationLine = stationLineOverride || sessionHeader.stationLine;

  const titleDateStr = view.maxValidTo
    ? formatTitleDateUs(view.maxValidTo)
    : formatTitleDateUs(new Date());

  const seasonLabel = view.currentSeason.season;
  const scheduleTitleLine = `${seasonLabel} Flight Schedule Till Dated (${titleDateStr})`;

  const handlePdf = async () => {
    setPdfBusy(true);
    try {
      const scope = airlineId && airline?.name ? `-${airline.code || 'airline'}` : '-full';
      const { downloadScheduleAirlinePdf } = await import(
        '@/components/fris/advance/scheduleAirlineSchedulePdf'
      );
      await downloadScheduleAirlinePdf({
        companyName,
        stationLine,
        scheduleTitleLine,
        rows: view.rows,
        footerDayCounts: view.footerDayCounts,
        totalWeeklyFlights: view.totalWeeklyFlights,
        fileBaseName: `flight-schedule${scope}-${titleDateStr.replace(/[/\\]+/g, '-')}`,
      });
      toast.success('PDF downloaded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF failed');
    } finally {
      setPdfBusy(false);
    }
  };

  const headerLabels = [
    'Airline',
    'No. of flights',
    'Route',
    'Flight No.',
    'A/C Type',
    ...SCHEDULE_VIEW_FULL_WEEKDAY_NAMES,
    'Valid from',
    'Valid to',
  ];

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="max-w-[1920px] mx-auto px-3 py-6 print:px-2 print:py-3">
        <div className="mb-4 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/fris/advance?tab=schedule"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schedule Setup
          </Link>
          <div
            className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2"
            role="group"
            aria-label="Schedule season"
          >
            <button
              type="button"
              aria-pressed={seasonChoice === 'current'}
              onClick={() => setSeasonChoice('current')}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ${
                seasonChoice === 'current'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Current
              </span>
              {formatScheduleSeasonTitle(currentSeason)}
            </button>
            <button
              type="button"
              aria-pressed={seasonChoice === 'previous'}
              onClick={() => setSeasonChoice('previous')}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ${
                seasonChoice === 'previous'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Previous {previousSeason.season}
              </span>
              {formatScheduleSeasonTitle(previousSeason)}
            </button>
          </div>
        </div>

        {/* Header */}
        <header className="relative flex flex-col gap-4 lg:flex-row lg:items-center print:border-0 border-b border-gray-200 pb-4 mb-4">
          <div className="w-full max-w-[260px] min-w-[160px] shrink-0">
            <Image
              src={logoPath}
              alt="Logo"
              width={LOGO_PX.width}
              height={LOGO_PX.height}
              className="h-auto w-full max-h-[72px] object-contain object-left"
              priority
              sizes="260px"
            />
          </div>
          <div className="min-w-0 w-full px-2 text-center lg:absolute lg:left-1/2 lg:top-1/2 lg:w-auto lg:max-w-[60%] lg:-translate-x-1/2 lg:-translate-y-1/2">
            <p className="text-[18px] font-semibold text-gray-900">{companyName}</p>
            <p className="text-[16px] font-medium text-gray-800 mt-1">{stationLine}</p>
            <p className="text-[18px] font-semibold text-gray-900 mt-2">{scheduleTitleLine}</p>
          </div>
          <div className="shrink-0 lg:ml-auto print:hidden">
            <button
              type="button"
              onClick={() => void handlePdf()}
              disabled={pdfBusy}
              className="inline-flex items-center gap-2 rounded-xl font-medium text-sm text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2.5"
            >
              <Printer className="w-4 h-4" />
              {pdfBusy ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>
        </header>

        {airlineId && !airline && !loading && (
          <p className="text-amber-800 text-sm rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-3">
            Airline filter not found — showing the <strong>full schedule</strong>. Remove <code className="text-xs">airlineId</code> from the URL or pick a valid id.
          </p>
        )}

        {loading ? (
          <p className="text-gray-600 text-sm py-8">Loading schedule…</p>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-lg border border-emerald-300 bg-white shadow-sm print:shadow-none">
            <table className="table-fixed w-full min-w-[1280px] text-[12px] leading-snug border-collapse [&_thead_th]:text-[13px] [&_th]:text-center [&_td]:text-center">
              {/*
                Web-only: widen Mon–Sun (time ranges) vs valid dates; narrow valid columns.
                Percentages sum to 100%. min-w gives horizontal scroll before overlap.
              */}
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '3%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead>
                {view.rows.length > 0 && (
                  <ScheduleTotalsRow
                    footerDayCounts={view.footerDayCounts}
                    totalWeeklyFlights={view.totalWeeklyFlights}
                  />
                )}
                <tr className="bg-[#1e40af] text-white">
                  {headerLabels.map((h, hi) => (
                    <th
                      key={h}
                      className={`border border-gray-300 px-1 py-2 font-semibold align-middle text-center ${
                        hi >= 5 && hi <= 11
                          ? 'text-[11px] sm:text-[12px] leading-tight min-w-[5.5rem]'
                          : ''
                      } ${hi === 2 || hi === 4 ? 'text-[12px] sm:text-[13px]' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-gray-500">
                      {airlineId && airline
                        ? `No active ${seasonLabel} schedule rows for this airline.`
                        : `No active ${seasonLabel} schedule records.`}
                    </td>
                  </tr>
                ) : (
                  view.rows.map((row, idx) => (
                    <tr key={`${row.flightNo}-${idx}`} className="bg-white even:bg-gray-50/80">
                      <td className="border border-gray-200 px-1.5 py-1.5 text-gray-900 align-top break-words min-w-0 text-center">
                        {row.airlineName}
                      </td>
                      <td className="border border-gray-200 px-1 py-1.5 text-gray-800 align-top text-center tabular-nums">
                        {row.weeklyCount}
                      </td>
                      <td className="border border-gray-200 px-1.5 py-1.5 text-gray-800 align-top break-words min-w-0 text-center">
                        {row.route}
                      </td>
                      <td className="border border-gray-200 px-1.5 py-1.5 text-gray-800 align-top break-words min-w-0 whitespace-nowrap text-center">
                        {row.flightNo}
                      </td>
                      <td className="border border-gray-200 px-1.5 py-1.5 text-gray-800 align-top break-words min-w-0 text-center">
                        {row.aircraft}
                      </td>
                      {row.dayCells.map((c, di) => (
                        <td
                          key={SCHEDULE_VIEW_FULL_WEEKDAY_NAMES[di]}
                          className="border border-gray-200 px-1 py-1.5 text-center text-gray-800 align-top text-[9px] sm:text-[10px] leading-tight tabular-nums min-w-[5.5rem] whitespace-nowrap"
                          title={c || undefined}
                        >
                          {c}
                        </td>
                      ))}
                      <td className="border border-gray-200 px-1.5 py-1.5 text-gray-800 align-top text-center">
                        {row.validFrom}
                      </td>
                      <td className="border border-gray-200 px-1.5 py-1.5 text-gray-800 align-top text-center">
                        {row.validTo}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
