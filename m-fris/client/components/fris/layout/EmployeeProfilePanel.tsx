'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Row = { label: string; value: string };

function read(key: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(key)?.trim() ?? '';
}

function isUltraAdmin(name: string, userId: string): boolean {
  const compact = `${name} ${userId}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return compact.includes('yashrajtomar') || compact.includes('rishimehto');
}

export function EmployeeProfilePanel({ open, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open) return;
    const userName = read('userName') || read('userId') || read('userid') || 'Employee';
    const userId = read('userId') || read('userid');
    const station = read('userStationCity') || read('userAirport');
    const code = read('userStationCode');
    const stationLine = station && code ? `${station} (${code})` : station || code;
    setName(userName);
    setTitle(isUltraAdmin(userName, userId) ? 'Ultra Admin' : read('userDesignation') || read('userRole') || 'Employee');
    const next: Row[] = [
      { label: 'Employee ID', value: userId },
      { label: 'Email', value: read('userEmail') },
      { label: 'Phone', value: read('userPhone') },
      { label: 'Station', value: stationLine },
      { label: 'Department', value: read('userDepartmentLabel') },
      { label: 'Designation', value: read('userDesignation') },
      { label: 'Company', value: read('userCompany') },
    ].filter((row) => row.value);
    setRows(next);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-profile-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="employee-profile-title" className="text-lg font-semibold">
              {name}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="grid gap-3 px-5 py-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-slate-900">{row.value}</dd>
            </div>
          ))}
          {rows.length === 0 ? <p className="text-sm text-slate-500">No employee details are saved for this session.</p> : null}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
