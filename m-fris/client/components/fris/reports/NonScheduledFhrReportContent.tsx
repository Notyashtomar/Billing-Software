'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  FileText,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import {
  ReportsMobileCard,
  ReportsMobileCardActions,
  ReportsMobileCardButton,
  ReportsMobileCardField,
  ReportsMobileCardGrid,
  ReportsMobileCardHeader,
  ReportsMobileCardList,
} from '@/components/fris/reports/ReportsMobileCards';
import {
  FILTER_OPTION_OPTIONS,
  REPORT_TYPE_OPTIONS,
  daysAgoYmd,
  loadNonScheduledFhrReportRows,
  localCalendarYmd,
  validateNonScheduledFhrFilters,
  type NonScheduledFilterOption,
  type NonScheduledFhrReportRow,
  type NonScheduledReportType,
} from '@/components/fris/reports/non-scheduled-fhr-report-helpers';
import { downloadFhrReportPdf, downloadEquipmentReportPdfForFlight, buildScheduledTeamReportPdfFromFhrEmbed } from '@/components/fris/flights/scheduledairlines/reportsPdf';
import { fetchNsFormReportPayload } from '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportDownloads';
import {
  BOOKING_CONTROL,
  BOOKING_FORM_CARD,
  BOOKING_FORM_HEADER,
  BOOKING_GET_BTN,
} from '@/components/fris/flights/non-scheduled-booking/bookingPageLayout';
import {
  FRIS_REPORTS_MOBILE_LIST_CLASS,
  FRIS_REPORTS_PAGE_SHELL_CLASS,
  FRIS_REPORTS_TABLE_DESKTOP_CLASS,
} from '@/lib/fris-reports-responsive';
import { cn } from '@/lib/utils';
import { displayScheduledAirlinesTableSerial } from '@/utils/dataProcessor';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
} from '@/lib/form-validation';

const NS_FILTER_FIELD_ORDER = ['fromDate', 'tillDate', 'serialFrom', 'serialTill'] as const;
type NsFilterField = (typeof NS_FILTER_FIELD_ORDER)[number];

const FILTER_LABEL =
  'mb-1 block text-[11px] font-medium leading-tight text-slate-600 sm:mb-1.5 sm:text-xs md:text-sm';

const FILTER_FIELD_BASE =
  'min-w-0 w-full sm:w-[calc(50%-0.375rem)] md:w-[calc(33.333%-0.5rem)] lg:w-[calc(25%-0.5625rem)]';

const th =
  'sticky top-0 z-10 border-b border-amber-100 bg-amber-50/95 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur-sm';
const td = 'border-b border-slate-100 px-3 py-2.5 text-sm text-slate-700';

function FilterField({
  label,
  children,
  className,
  subdued,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  subdued?: boolean;
}) {
  return (
    <div
      className={cn(
        FILTER_FIELD_BASE,
        'transition-opacity duration-150',
        subdued && 'opacity-55',
        className,
      )}
    >
      <span className={FILTER_LABEL}>{label}</span>
      {children}
    </div>
  );
}

export function NonScheduledFhrReportContent() {
  const todayYmd = useMemo(() => localCalendarYmd(), []);
  const [reportType, setReportType] = useState<NonScheduledReportType>('flight-report');
  const [filterOption, setFilterOption] = useState<NonScheduledFilterOption>('date-between');
  const [fromDate, setFromDate] = useState(() => daysAgoYmd(200));
  const [tillDate, setTillDate] = useState(() => todayYmd);
  const [serialFrom, setSerialFrom] = useState('');
  const [serialTill, setSerialTill] = useState('');
  const [rows, setRows] = useState<NonScheduledFhrReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingSerial, setDownloadingSerial] = useState<string | null>(null);
  const { errors, clearField, clearAll, applyAndFocus } =
    useFieldErrors<NsFilterField>(NS_FILTER_FIELD_ORDER);

  const isDateFilter = filterOption === 'date-between';

  const filterEndMinDate = useMemo(() => {
    if (!fromDate?.trim()) return undefined;
    const parts = fromDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [y, m, day] = parts;
    return new Date(y!, m! - 1, day!);
  }, [fromDate]);

  const filterStartMaxDate = useMemo(() => {
    if (!tillDate?.trim()) return new Date();
    const parts = tillDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date();
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    const cap = new Date();
    cap.setHours(0, 0, 0, 0);
    return end.getTime() <= cap.getTime() ? end : cap;
  }, [tillDate]);

  const handleGet = useCallback(async () => {
    const next = validateNonScheduledFhrFilters({
      filterOption,
      fromDate,
      tillDate,
      serialFrom,
      serialTill,
    });
    if (applyAndFocus(next)) return;

    setLoading(true);
    setRows([]);
    try {
      const loaded = await loadNonScheduledFhrReportRows({
        filterOption,
        fromDate,
        tillDate,
        serialFrom,
        serialTill,
      });
      setRows(loaded);
      if (loaded.length === 0) {
        toast.message('No non-scheduled flights match these filters.');
      } else {
        toast.success(`Found ${loaded.length} flight(s).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load flights.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterOption, fromDate, serialFrom, serialTill, tillDate, applyAndFocus]);

  const handleDownload = useCallback(
    async (row: NonScheduledFhrReportRow) => {
      setDownloadingSerial(row.serial);
      try {
        if (reportType === 'equipment-report') {
          const { main, reportHeaderExtras } = await fetchNsFormReportPayload(row.serial);
          await downloadEquipmentReportPdfForFlight(row.flight, main, undefined, {
            challanNo: row.flight.challanNo || reportHeaderExtras.challanNo,
            bookingNo: row.flight.bookingNo || reportHeaderExtras.bookingNo,
            operation: reportHeaderExtras.operation,
            handlingType: 'Non-Scheduled',
            mtow: reportHeaderExtras.mtow,
          });
          toast.success('GSE report downloaded.');
        } else if (reportType === 'team-report') {
          const { main, reportHeaderExtras } = await fetchNsFormReportPayload(row.serial);
          const doc = await buildScheduledTeamReportPdfFromFhrEmbed(
            row.flight,
            row.serial,
            main,
            {
              challanNo: row.flight.challanNo || reportHeaderExtras.challanNo,
              bookingNo: row.flight.bookingNo || reportHeaderExtras.bookingNo,
              operation: reportHeaderExtras.operation,
              handlingType: 'Non-Scheduled',
              mtow: reportHeaderExtras.mtow,
            },
          );
          if (!doc) {
            throw new Error('No team allocation data is available for this flight.');
          }
          doc.save(`Team-Report-${row.flight.flightNo || 'flight'}-${row.serial}.pdf`);
          toast.success('Team report downloaded.');
        } else {
          // Same forms → PDF path as Open → Reports (ns_fhr hydrate + overrides).
          const { main, reportOverrides, reportHeaderExtras } =
            await fetchNsFormReportPayload(row.serial);
          await downloadFhrReportPdf(
            row.flight,
            main,
            undefined,
            {
              challanNo: row.flight.challanNo || reportHeaderExtras.challanNo,
              bookingNo: row.flight.bookingNo || reportHeaderExtras.bookingNo,
              operation: reportHeaderExtras.operation,
              handlingType: 'Non-Scheduled',
              mtow: reportHeaderExtras.mtow,
            },
            reportOverrides,
          );
          toast.success('FHR report downloaded.');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Download failed.');
      } finally {
        setDownloadingSerial(null);
      }
    },
    [reportType],
  );

  const reportActionLabel =
    reportType === 'equipment-report'
      ? 'GSE PDF'
      : reportType === 'team-report'
        ? 'Team PDF'
        : 'FHR PDF';

  const blurActive = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const handleFilterOptionChange = useCallback(
    (value: string) => {
      setFilterOption(value as NonScheduledFilterOption);
      clearAll();
      blurActive();
    },
    [blurActive, clearAll],
  );

  const handleReportTypeChange = useCallback(
    (value: string) => {
      setReportType(value as NonScheduledReportType);
      blurActive();
    },
    [blurActive],
  );

  return (
    <div
      className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-gradient-to-br from-slate-50 via-white to-amber-50/40`}
    >
      <div className="mx-auto max-w-[100rem]">
        <FrisPageHeader title="Non Scheduled FHR, GSE & Team Report" icon={FileText} />

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5"
        >
          <div className={`${BOOKING_FORM_CARD} overflow-visible`}>
            <div className={BOOKING_FORM_HEADER}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white sm:text-base">
                <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
                Filter Options
              </h2>
            </div>

            <div className="overflow-x-auto overflow-y-visible p-3 sm:p-4 lg:p-5 [scrollbar-width:thin]">
              <div
                className={cn(
                  'flex min-w-0 flex-col gap-3',
                  'sm:flex-row sm:flex-wrap sm:items-end',
                  'xl:flex-nowrap xl:gap-2.5',
                  '2xl:gap-3',
                )}
              >
                <FilterField
                  label="Report Type"
                  className="relative z-30 sm:max-w-[11rem] xl:w-[9.5rem] xl:flex-none 2xl:w-[10.5rem]"
                >
                  <AdminRadioDropdown
                    id="ns-fhr-report-type"
                    value={reportType}
                    onChange={handleReportTypeChange}
                    options={REPORT_TYPE_OPTIONS}
                    className={BOOKING_CONTROL}
                    aria-label="Report type"
                  />
                  <FormFieldError />
                </FilterField>

                <FilterField
                  label="Filter Option"
                  className="relative z-30 sm:max-w-[11rem] xl:w-[9.5rem] xl:flex-none 2xl:w-[10.5rem]"
                >
                  <AdminRadioDropdown
                    id="ns-fhr-filter-option"
                    value={filterOption}
                    onChange={handleFilterOptionChange}
                    options={FILTER_OPTION_OPTIONS}
                    className={BOOKING_CONTROL}
                    aria-label="Filter option"
                  />
                  <FormFieldError />
                </FilterField>

                <FilterField
                  label="From Date"
                  subdued={!isDateFilter}
                  className={cn(
                    'relative z-20 sm:max-w-[10.5rem] xl:w-[9rem] xl:flex-none 2xl:w-[9.5rem]',
                    errors.fromDate && FRIS_INVALID_PICKER_WRAP,
                  )}
                >
                  <DatePicker
                    id="field-fromDate"
                    value={fromDate}
                    onChange={(v) => {
                      setFromDate(v);
                      clearField('fromDate');
                    }}
                    valueFormat="yyyy-MM-dd"
                    maxDate={filterStartMaxDate}
                  />
                  <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
                </FilterField>

                <FilterField
                  label="Till Date"
                  subdued={!isDateFilter}
                  className={cn(
                    'relative z-20 sm:max-w-[10.5rem] xl:w-[9rem] xl:flex-none 2xl:w-[9.5rem]',
                    errors.tillDate && FRIS_INVALID_PICKER_WRAP,
                  )}
                >
                  <DatePicker
                    id="field-tillDate"
                    value={tillDate}
                    onChange={(v) => {
                      setTillDate(v);
                      clearField('tillDate');
                    }}
                    valueFormat="yyyy-MM-dd"
                    minDate={filterEndMinDate}
                    maxDate={new Date()}
                  />
                  <FormFieldError id="field-tillDate-error" message={errors.tillDate} />
                </FilterField>

                <div
                  className={cn(
                    'flex w-full min-w-0 flex-col gap-2',
                    'sm:w-[calc(100%-0px)] md:w-full lg:w-[calc(50%-0.375rem)]',
                    'xl:flex xl:w-auto xl:min-w-[14rem] xl:flex-1 xl:flex-row xl:items-end xl:gap-2',
                    '2xl:min-w-[16rem] 2xl:flex-none 2xl:w-[17rem]',
                    isDateFilter && 'opacity-55',
                  )}
                >
                  <p
                    className={cn(
                      FILTER_LABEL,
                      'mb-0 shrink-0 font-semibold text-slate-800',
                      'xl:pb-2.5 xl:text-xs',
                    )}
                  >
                    Serial No Between
                  </p>
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor="field-serialFrom">
                        Serial No. from
                      </label>
                      <input
                        id="field-serialFrom"
                        type="text"
                        inputMode="numeric"
                        value={serialFrom}
                        onChange={(e) => {
                          setSerialFrom(e.target.value);
                          clearField('serialFrom');
                        }}
                        placeholder="From"
                        className={cn(BOOKING_CONTROL, errors.serialFrom && FRIS_INVALID_CONTROL)}
                        autoComplete="off"
                        aria-label="Serial number from"
                        aria-invalid={!!errors.serialFrom}
                      />
                      <FormFieldError id="field-serialFrom-error" message={errors.serialFrom} />
                    </div>
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor="field-serialTill">
                        Serial till
                      </label>
                      <input
                        id="field-serialTill"
                        type="text"
                        inputMode="numeric"
                        value={serialTill}
                        onChange={(e) => {
                          setSerialTill(e.target.value);
                          clearField('serialTill');
                        }}
                        placeholder="Till"
                        className={cn(BOOKING_CONTROL, errors.serialTill && FRIS_INVALID_CONTROL)}
                        autoComplete="off"
                        aria-label="Serial number till"
                        aria-invalid={!!errors.serialTill}
                      />
                      <FormFieldError id="field-serialTill-error" message={errors.serialTill} />
                    </div>
                  </div>
                </div>

                <div className={cn('w-full shrink-0 sm:w-auto xl:ml-auto', FLIGHT_FILTER_ACTIONS_PB)}>
                  <span className="sr-only">Search</span>
                  <button
                    type="button"
                    onClick={() => void handleGet()}
                    disabled={loading}
                    className={cn(BOOKING_GET_BTN, 'h-10 w-full min-w-[5.5rem] sm:w-auto')}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Search className="h-4 w-4" aria-hidden />
                    )}
                    Get
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm"
        >
          <div className="border-b border-amber-100 bg-amber-500/95 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-white sm:text-base">
              {reportType === 'equipment-report'
                ? 'GSE report results'
                : reportType === 'team-report'
                  ? 'Team report results'
                  : 'FHR report results'}
            </h2>
            <p className="text-xs text-amber-50">
              Non-scheduled flights for your station · cancelled flights excluded
            </p>
          </div>

          {rows.length > 0 ? (
            <p className="border-b border-amber-50 bg-amber-50/40 px-4 py-2 text-xs text-slate-600 sm:px-5">
              Showing {rows.length} flight(s)
            </p>
          ) : null}

          {rows.length === 0 ? (
            <div className="px-4 py-14 text-center sm:px-5">
              <div className="flex flex-col items-center gap-2 text-slate-500">
                {loading ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
                    <p className="text-sm">Loading flights…</p>
                  </>
                ) : (
                  <>
                    <FileText className="h-8 w-8 text-amber-300" aria-hidden />
                    <p className="text-sm font-medium text-slate-700">
                      Set filters and click Get
                    </p>
                    <p className="max-w-sm text-xs text-slate-500">
                      Use Date Between or Serial No Between, then download per-row PDFs.
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className={FRIS_REPORTS_MOBILE_LIST_CLASS}>
                <ReportsMobileCardList className="p-3 sm:p-4">
                  {rows.map((row, index) => (
                    <ReportsMobileCard key={row.serial}>
                      <ReportsMobileCardHeader
                        title={row.flight.airline || '—'}
                        subtitle={row.flight.flightNo || '—'}
                        badge={
                          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                            #{index + 1}
                          </span>
                        }
                      />
                      <ReportsMobileCardGrid>
                        <ReportsMobileCardField
                          label="Serial"
                          value={displayScheduledAirlinesTableSerial(row.flight)}
                        />
                        <ReportsMobileCardField
                          label="STA Date"
                          value={row.flight.staDate || row.flight.ataDate || '—'}
                        />
                        <ReportsMobileCardField label="Ops" value={row.flight.ops || '—'} fullWidth />
                      </ReportsMobileCardGrid>
                      <ReportsMobileCardActions>
                        <ReportsMobileCardButton
                          type="button"
                          variant="primary"
                          className="bg-amber-500 hover:bg-amber-600"
                          disabled={downloadingSerial === row.serial}
                          onClick={() => void handleDownload(row)}
                        >
                          {downloadingSerial === row.serial ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          {reportActionLabel}
                        </ReportsMobileCardButton>
                      </ReportsMobileCardActions>
                    </ReportsMobileCard>
                  ))}
                </ReportsMobileCardList>
              </div>

              <div className={FRIS_REPORTS_TABLE_DESKTOP_CLASS}>
                <ReportsResponsiveTable scrollClassName="max-h-[70dvh] overflow-y-auto overscroll-y-contain">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr>
                        <th className={th}>#</th>
                        <th className={th}>Serial</th>
                        <th className={th}>Airline</th>
                        <th className={th}>Flight</th>
                        <th className={th}>STA Date</th>
                        <th className={th}>Ops</th>
                        <th className={th}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={row.serial} className="hover:bg-amber-50/30">
                          <td className={td}>{index + 1}</td>
                          <td className={`${td} font-medium tabular-nums`}>
                            {displayScheduledAirlinesTableSerial(row.flight)}
                          </td>
                          <td className={td}>{row.flight.airline || '—'}</td>
                          <td className={td}>{row.flight.flightNo || '—'}</td>
                          <td className={td}>{row.flight.staDate || row.flight.ataDate || '—'}</td>
                          <td className={td}>{row.flight.ops || '—'}</td>
                          <td className={td}>
                            <button
                              type="button"
                              onClick={() => void handleDownload(row)}
                              disabled={downloadingSerial === row.serial}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {downloadingSerial === row.serial ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              {reportActionLabel}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ReportsResponsiveTable>
              </div>
            </>
          )}
        </motion.section>
      </div>
    </div>
  );
}
