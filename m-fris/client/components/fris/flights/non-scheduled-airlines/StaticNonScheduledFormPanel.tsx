'use client';

import type { NonScheduledFlightData } from './types';

type Props = {
  flight: NonScheduledFlightData;
  sectionLabel: string;
};

export default function StaticNonScheduledFormPanel({ flight, sectionLabel }: Props) {
  return (
    <div className="space-y-4 p-1">
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        {sectionLabel} is read-only. Non-scheduled flight data is not loaded from the server.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Row label="Serial" value={String(flight.sNo)} />
        <Row label="Flight" value={flight.flightNo} />
        <Row label="Airline" value={flight.airline} />
        <Row label="Aircraft" value={flight.aircraft} />
        <Row label="Routing" value={flight.routing} className="col-span-2" />
        <Row label="STA" value={`${flight.staDate} ${flight.staTime}`} />
        <Row label="STD" value={`${flight.stdDate} ${flight.stdTime}`} />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

