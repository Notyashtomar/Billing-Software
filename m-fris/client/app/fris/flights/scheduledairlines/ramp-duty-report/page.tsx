'use client';

import React, { useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, ArrowLeft, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';

function formatDisplayDate(dateStr: string): string {
  if (!dateStr?.trim()) return '–';
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function RampDutyReportContent() {
  const searchParams = useSearchParams();
  const slNo = searchParams.get('slNo') ?? '–';
  const fhrNo = slNo;
  const airline = '–';
  const flightNo = '–';
  const aircraft = '–';
  const operation = '–';
  const staDate = '–';
  const staTime = '–';
  const stdDate = '–';
  const stdTime = '–';
  const routing = '–';
  const ataDate = '–';
  const ataTime = '–';
  const atdDate = '–';
  const atdTime = '–';

  const handleDownload = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="min-h-screen bg-white p-6 print:p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header - hide when printing */}
        <div className="flex items-center justify-between mb-6 print:mb-4 print:hidden">
          <Link
            href="/fris/flights/scheduledairlines"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>

        <FrisPageHeader title="Ramp Duty Allocation" icon={ClipboardList} />

        {/* Flight details grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4 mb-8 text-sm">
          <div><span className="text-gray-600">FHR No :</span> <span className="font-medium">{fhrNo}</span></div>
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

        {/* Employee duty allocation table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
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
              <tr className="border-b border-gray-100">
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
                <td className="p-3 text-gray-500">–</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function RampDutyReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading report…</div>}>
      <RampDutyReportContent />
    </Suspense>
  );
}
