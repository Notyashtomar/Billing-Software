'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Save } from 'lucide-react';
import {
  FlightData,
  MainDetailsData,
  RampDetails3Data,
  EmployeeAllocationRowData,
  normalizeRampDetails3Data,
  normalizeRampDetails2List,
  mapRampDetails2ToEmployeeAllocation,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import { getNsRawFormSavedUrl } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { downloadRampDutyAllocationPdf } from './reportsPdf';
import {
  scheduleStaDateFromRow,
  scheduleStdDateFromRow,
  scheduleStaTimeRawFromRow,
  scheduleStdTimeRawFromRow,
} from './scheduledRowSchedule';
import { routingFromMainAndFlight } from './formRoutingFromMain';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_H_SCROLL_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

function formatDisplayDate(dateStr: string): string {
  if (!dateStr?.trim()) return '–';
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

export interface RampDutyAllocationReportProps {
  /** Ramp duty allocation data from server (ramp-details-3 by serial). When null, form uses flightRow for fallbacks and will fetch. */
  flight: RampDetails3Data | null;
  /** Table row (FlightData) for building fhrNo URL when flight is null, and for PDF download. */
  flightRow: FlightData;
  /** Server-verified main details — preferred over raw FlightData when serverData has no value. */
  mainDetails?: MainDetailsData | null;
}

export default function RampDutyAllocationReport({ flight: flightData, flightRow, mainDetails }: RampDutyAllocationReportProps) {
  const [serverData, setServerData] = useState<RampDetails3Data | null>(flightData ?? null);
  const [allocationRows, setAllocationRows] = useState<EmployeeAllocationRowData[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Keep serverData in sync when parent passes new RampDetails3Data
  useEffect(() => {
    if (flightData != null) setServerData(flightData);
  }, [flightData]);

  const fhrNo =
    flightData?.fhrNo?.trim() ??
    (flightRow?.destination != null && flightRow?.slNo != null
      ? `${String(flightRow.destination).trim()}/${displayScheduledAirlinesTableSerial(flightRow)}`
      : flightRow?.flightNo?.trim() ?? '');

  const serial =
    flightRow?.slNo != null && String(flightRow.slNo).trim() !== ''
      ? nsFormSerialForFlight(flightRow)
      : '';
  const baseUrl = serial ? getNsRawFormSavedUrl('ramp-details-3', serial) : '';
  const dutyUrl = serial ? getNsRawFormSavedUrl('ramp-details-2', serial) : '';

  useEffect(() => {
    if (!baseUrl) return;
    fetch(baseUrl)
      .then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        if (!text || text.trim() === '') return null;
        try {
          return text.trim() === 'null' ? null : JSON.parse(text);
        } catch {
          return null;
        }
      })
      .then((raw) => {
        const data = normalizeRampDetails3Data(raw);
        if (data) setServerData(data);
      })
      .catch(() => {});
  }, [baseUrl]);

  // Source of truth for employee rows: duty allocation form (ramp-details-2).
  useEffect(() => {
    if (!dutyUrl) {
      setAllocationRows([]);
      return;
    }
    let cancelled = false;
    fetch(dutyUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        if (cancelled) return;
        const list = normalizeRampDetails2List(raw);
        setAllocationRows(list.map(mapRampDetails2ToEmployeeAllocation));
      })
      .catch(() => {
        if (!cancelled) setAllocationRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dutyUrl]);

  const d: RampDetails3Data | null = serverData;
  const displayFhrNo = (d?.fhrNo ?? fhrNo) || '–';
  const airline  = d?.airline  ?? mainDetails?.airlineName  ?? flightRow.airline  ?? '–';
  const flightNo = d?.flightNo ?? mainDetails?.flightCode   ?? flightRow.flightNo ?? '–';
  const aircraft = d?.aircraft ?? mainDetails?.aircraftType ?? flightRow.aircraft ?? '–';
  const operation = d?.operation ?? flightRow.flightType ?? '–';
  const staDate = scheduleStaDateFromRow(flightRow) || '–';
  const staTime = scheduleStaTimeRawFromRow(flightRow) || '–';
  const stdDate = scheduleStdDateFromRow(flightRow) || '–';
  const stdTime = scheduleStdTimeRawFromRow(flightRow) || '–';
  const routingResolved = routingFromMainAndFlight(d?.routing, mainDetails, flightRow);
  const routing = routingResolved.trim() !== '' ? routingResolved : '–';
  const ataDate =
    d?.ataDate ? formatDisplayDate(d.ataDate) : flightRow.staDate ? formatDisplayDate(flightRow.staDate) : staDate;
  const ataTime = d?.ataTime ?? (scheduleStaTimeRawFromRow(flightRow) || '–');
  const atdDate =
    d?.atdDate ? formatDisplayDate(d.atdDate) : flightRow.stdDate ? formatDisplayDate(flightRow.stdDate) : stdDate;
  const atdTime = d?.atdTime ?? (scheduleStdTimeRawFromRow(flightRow) || '–');

  // Prefer live duty-allocation rows; fall back to saved report snapshot.
  const rows: EmployeeAllocationRowData[] =
    allocationRows.length > 0
      ? allocationRows
      : d?.employeeAllocations && d.employeeAllocations.length > 0
        ? d.employeeAllocations
        : [];

  const handleDownload = useCallback(() => {
    void downloadRampDutyAllocationPdf(flightRow, rows);
  }, [flightRow, rows]);

  const handleSave = useCallback(() => {
    if (!baseUrl) return;
    setIsSaving(true);
    const payload: Partial<RampDetails3Data> = {
      fhrNo: d?.fhrNo || fhrNo || undefined,
      airline:  airline  !== '–' ? airline  : (mainDetails?.airlineName  ?? flightRow.airline),
      aircraft: aircraft !== '–' ? aircraft : (mainDetails?.aircraftType ?? flightRow.aircraft),
      operation: operation !== '–' ? operation : flightRow.flightType,
      staDate: flightRow.staDate,
      staTime: scheduleStaTimeRawFromRow(flightRow) || undefined,
      stdDate: flightRow.stdDate,
      stdTime: scheduleStdTimeRawFromRow(flightRow) || undefined,
      routing:
        routing !== '–'
          ? routingResolved
          : routingFromMainAndFlight(undefined, mainDetails, flightRow),
      ataDate: d?.ataDate ?? flightRow.staDate,
      ataTime: d?.ataTime ?? (scheduleStaTimeRawFromRow(flightRow) || undefined),
      atdDate: d?.atdDate ?? flightRow.stdDate,
      atdTime: d?.atdTime ?? (scheduleStdTimeRawFromRow(flightRow) || undefined),
      employeeAllocations: rows.map(
        (r): EmployeeAllocationRowData => ({
          employeeCode: r.employeeCode ?? '',
          employeeName: r.employeeName ?? '',
          area: r.area ?? '',
          dutyAllocation: r.dutyAllocation ?? '',
          remarks: r.remarks ?? '',
        }),
      ),
    };

    const hasId = serverData?._id != null;
    fetch(baseUrl, {
      method: hasId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const updated = normalizeRampDetails3Data(raw);
        if (updated) setServerData(updated);
      })
      .finally(() => setIsSaving(false));
  }, [
    baseUrl,
    serverData?._id,
    airline,
    aircraft,
    operation,
    routing,
    routingResolved,
    rows,
    d,
    flightRow,
    mainDetails,
    fhrNo,
  ]);

  return (
    <div className={`${FLIGHT_DETAILS_FORM_ROOT_CLASS} bg-white`}>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-gray-200 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!baseUrl || isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      </div>
      <div className={`${FLIGHT_DETAILS_FORM_BODY_CLASS} p-4 sm:p-6`}>
        <h1 className="mb-4 border-b-2 border-gray-900 pb-2 text-lg font-bold text-gray-900 sm:text-xl">
          Ramp Duty Allocation
        </h1>
        <div className="mb-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <div><span className="text-gray-600">FHR No :</span> <span className="font-medium">{displayFhrNo}</span></div>
          <div><span className="text-gray-600">Airline :</span> <span className="font-medium">{airline}</span></div>
          <div><span className="text-gray-600">Flight No. :</span> <span className="font-medium">{flightNo}</span></div>
          <div><span className="text-gray-600">Aircraft :</span> <span className="font-medium">{aircraft}</span></div>
          <div><span className="text-gray-600">Operation :</span> <span className="font-medium">{operation}</span></div>
          <div><span className="text-gray-600">STA Date :</span> <span className="font-medium">{staDate}</span></div>
          <div><span className="text-gray-600">STA Time :</span> <span className="font-medium">{staTime}</span></div>
          <div><span className="text-gray-600">STD Date :</span> <span className="font-medium">{stdDate}</span></div>
          <div><span className="text-gray-600">STD Time :</span> <span className="font-medium">{stdTime}</span></div>
          <div><span className="text-gray-600">Routing :</span> <span className="font-medium">{routing}</span></div>
          <div><span className="text-gray-600">ATA Date :</span> <span className="font-medium">{ataDate}</span></div>
          <div><span className="text-gray-600">ATA Time :</span> <span className="font-medium">{ataTime}</span></div>
          <div><span className="text-gray-600">ATD Date :</span> <span className="font-medium">{atdDate}</span></div>
          <div><span className="text-gray-600">ATD Time :</span> <span className="font-medium">{atdTime}</span></div>
        </div>
        <div className={`${FLIGHT_DETAILS_H_SCROLL_CLASS} rounded-lg border border-gray-200`}>
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="text-left p-3 font-semibold text-gray-700">Employee Code</th>
                <th className="text-left p-3 font-semibold text-gray-700">Employee Name</th>
                <th className="text-left p-3 font-semibold text-gray-700">Area</th>
                <th className="text-left p-3 font-semibold text-gray-700">Duty Allocation</th>
                <th className="text-left p-3 font-semibold text-gray-700">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-b border-gray-100">
                  <td colSpan={5} className="p-3 text-gray-500 text-center">No allocation records</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="p-3">{row.employeeCode ?? '–'}</td>
                    <td className="p-3">{row.employeeName ?? '–'}</td>
                    <td className="p-3">{row.area ?? '–'}</td>
                    <td className="p-3">{row.dutyAllocation ?? '–'}</td>
                    <td className="p-3">{row.remarks ?? '–'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
