'use client';

import { useMemo } from 'react';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { joinDatetimeLocal, splitDatetimeLocal } from '@/lib/datetimeLocal';
import { type FlightData, displayScheduledAirlinesTableSerial } from '@/utils/dataProcessor';

const INTIMATION_MODE_OPTIONS = [
  { value: '', label: 'Select mode' },
  { value: 'Email', label: 'Email' },
  { value: 'Phone', label: 'Phone' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'In Person', label: 'In Person' },
  { value: 'Other', label: 'Other' },
];

type Props = {
  flight: FlightData;
  intimationTime: string;
  intimatedBy: string;
  intimationPersonEmail: string;
  intimationMode: string;
  proofNote: string;
  proofAttachment: { fileName: string; mimeType: string; base64: string } | null;
  onIntimationTimeChange: (value: string) => void;
  onIntimatedByChange: (value: string) => void;
  onIntimationPersonEmailChange: (value: string) => void;
  onIntimationModeChange: (value: string) => void;
  onProofNoteChange: (value: string) => void;
  onProofFileChange: (file: File | null) => void;
};

export default function IntimationForm({
  flight,
  intimationTime,
  intimatedBy,
  intimationPersonEmail,
  intimationMode,
  proofNote,
  proofAttachment,
  onIntimationTimeChange,
  onIntimatedByChange,
  onIntimationPersonEmailChange,
  onIntimationModeChange,
  onProofNoteChange,
  onProofFileChange,
}: Props) {
  const { date: intDate, time: intTime } = useMemo(() => splitDatetimeLocal(intimationTime), [intimationTime]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-5 shadow-sm ring-1 ring-emerald-500/5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Flight summary</p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
          <p>
            <span className="font-medium">Serial:</span>{' '}
            {flight.slNo ? displayScheduledAirlinesTableSerial(flight) : '-'}
          </p>
          <p>
            <span className="font-medium">Airline:</span> {flight.airline || '-'}
          </p>
          <p>
            <span className="font-medium">Flight No:</span> {flight.flightNo || '-'}
          </p>
          <p>
            <span className="font-medium">Aircraft:</span> {flight.aircraft || '-'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-3 md:col-span-2">
          <p className="text-xs font-medium text-gray-600">Intimation time</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-gray-500">Date</label>
              <DatePicker
                value={intDate}
                valueFormat="yyyy-MM-dd"
                placeholder="Select date"
                onChange={(d) => onIntimationTimeChange(joinDatetimeLocal(d, intTime))}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-gray-500">Time (24h)</label>
              <TimeSelect24
                value={intTime}
                onChange={(t) => onIntimationTimeChange(joinDatetimeLocal(intDate, t))}
                className="w-full"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Intimated by</label>
          <input
            type="text"
            value={intimatedBy}
            onChange={(e) => onIntimatedByChange(e.target.value)}
            placeholder="Enter name/designation"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Intimation person email
          </label>
          <input
            id="field-intimationPersonEmail"
            type="email"
            value={intimationPersonEmail}
            onChange={(e) => onIntimationPersonEmailChange(e.target.value)}
            placeholder="email@airline.com"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Intimation mode</label>
          <AdminRadioDropdown
            value={intimationMode}
            onChange={onIntimationModeChange}
            options={INTIMATION_MODE_OPTIONS}
            className="min-h-10"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Upload proof of intimation
          </label>
          <input
            type="file"
            onChange={(e) => onProofFileChange(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-800"
          />
          {proofAttachment?.fileName && (
            <p className="mt-2 text-xs text-emerald-800/80">
              Attached: <span className="font-semibold">{proofAttachment.fileName}</span>
            </p>
          )}
        </div>
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Proof details / notes</label>
          <textarea
            value={proofNote}
            onChange={(e) => onProofNoteChange(e.target.value)}
            rows={3}
            placeholder="Add any supporting proof notes"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>
    </div>
  );
}
