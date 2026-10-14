'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FRIS_REPORTS_TABLE_SCROLL_CLASS } from '@/lib/fris-reports-responsive';

const sectionTitle =
  'bg-emerald-500 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-white shadow-sm sm:text-sm';

const thBase =
  'border border-emerald-200/80 bg-emerald-100/90 px-1.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-emerald-950 sm:px-2 sm:text-xs';

const thCenter = cn(thBase, 'text-center');

const tdCell = 'border border-emerald-100/90 bg-white p-0.5 align-middle';

const inputSm =
  'box-border w-full min-h-[2.25rem] min-w-0 rounded-md border border-emerald-100/90 bg-white px-1.5 py-1 text-center text-xs text-emerald-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-200/60 sm:text-sm';

type HiredEntry = {
  date: string;
  gseManPower: string;
  unitsHired: string;
  startTime: string;
  endTime: string;
  timePerUnit: string;
  totalTime: string;
  agency: string;
  fltNo: string;
  acType: string;
  intlDom: string;
  reason: string;
};

function emptyHired(date: string): HiredEntry {
  return {
    date,
    gseManPower: '',
    unitsHired: '',
    startTime: '',
    endTime: '',
    timePerUnit: '',
    totalTime: '',
    agency: '',
    fltNo: '',
    acType: '',
    intlDom: '',
    reason: '',
  };
}

type HiredRow = HiredEntry & { id: string; sno: number };

const HIRED_KEYS: (keyof HiredEntry)[] = [
  'date',
  'gseManPower',
  'unitsHired',
  'startTime',
  'endTime',
  'timePerUnit',
  'totalTime',
  'agency',
  'fltNo',
  'acType',
  'intlDom',
  'reason',
];

const RESOURCE_LABELS = [
  'MG / DM / ADM',
  'S/SUP',
  'A/C Tech',
  'OPT 3',
  'OPT 2',
  'OPT 1',
  'U/H',
  'U/H GSE CLEANIN',
] as const;

type ResourceCells = {
  dayRostered: string;
  dayReported: string;
  nightRostered: string;
  nightReported: string;
  totalRostered: string;
  totalPresent: string;
};

function emptyResourceRow(): ResourceCells {
  return {
    dayRostered: '',
    dayReported: '',
    nightRostered: '',
    nightReported: '',
    totalRostered: '',
    totalPresent: '',
  };
}

type LeaveDraft = {
  name: string;
  eCode: string;
  desgn: string;
  leaveType: string;
  reason: string;
  shift: string;
  remarks: string;
};

function emptyLeave(): LeaveDraft {
  return { name: '', eCode: '', desgn: '', leaveType: '', reason: '', shift: '', remarks: '' };
}

type LeaveRow = LeaveDraft & { id: string };

type DefectDraft = { gse: string; defects: string; status: string; remarks: string };

function emptyDefect(): DefectDraft {
  return { gse: '', defects: '', status: '', remarks: '' };
}

type DefectRow = DefectDraft & { id: string };

type Props = {
  /** DD/MM/YYYY from parent filter — pre-fills hired / entry date fields. */
  dateDdMmYyyy: string;
};

export default function GsdReportOperationalTables({ dateDdMmYyyy }: Props) {
  const idSeq = useRef(0);
  const nextId = useCallback(() => {
    idSeq.current += 1;
    return `gsd-${idSeq.current}`;
  }, []);

  const [hiredDraft, setHiredDraft] = useState<HiredEntry>(() => emptyHired(''));
  const [hiredRows, setHiredRows] = useState<HiredRow[]>([]);

  const [resourceCells, setResourceCells] = useState<ResourceCells[]>(() =>
    RESOURCE_LABELS.map(() => emptyResourceRow()),
  );

  const [leaveDraft, setLeaveDraft] = useState<LeaveDraft>(() => emptyLeave());
  const [leaveRows, setLeaveRows] = useState<LeaveRow[]>([]);

  const [defectDraft, setDefectDraft] = useState<DefectDraft>(() => emptyDefect());
  const [defectRows, setDefectRows] = useState<DefectRow[]>([]);

  useEffect(() => {
    setHiredDraft((d) => ({ ...d, date: dateDdMmYyyy || '' }));
  }, [dateDdMmYyyy]);

  const setHiredField = useCallback((key: keyof HiredEntry, v: string) => {
    setHiredDraft((d) => ({ ...d, [key]: v }));
  }, []);

  const addHiredRow = useCallback(() => {
    setHiredRows((prev) => {
      const sno = prev.length + 1;
      return [...prev, { ...hiredDraft, id: nextId(), sno }];
    });
    setHiredDraft(emptyHired(dateDdMmYyyy || ''));
  }, [hiredDraft, nextId, dateDdMmYyyy]);

  const setResCell = useCallback((rowIndex: number, key: keyof ResourceCells, v: string) => {
    setResourceCells((prev) => {
      const copy = prev.map((r) => ({ ...r }));
      const row = copy[rowIndex];
      if (!row) return prev;
      copy[rowIndex] = { ...row, [key]: v };
      return copy;
    });
  }, []);

  const setLeaveField = useCallback((key: keyof LeaveDraft, v: string) => {
    setLeaveDraft((d) => ({ ...d, [key]: v }));
  }, []);

  const addLeaveRow = useCallback(() => {
    setLeaveRows((prev) => [...prev, { ...leaveDraft, id: nextId() }]);
    setLeaveDraft(emptyLeave());
  }, [leaveDraft, nextId]);

  const setDefectField = useCallback((key: keyof DefectDraft, v: string) => {
    setDefectDraft((d) => ({ ...d, [key]: v }));
  }, []);

  const addDefectRow = useCallback(() => {
    setDefectRows((prev) => [...prev, { ...defectDraft, id: nextId() }]);
    setDefectDraft(emptyDefect());
  }, [defectDraft, nextId]);

  const hiredHeaderCols = [
    'Date',
    'GSE / Man power hired',
    '# of units hired',
    'Start time',
    'End time',
    'Time per unit',
    'Total time',
    'Agency hired from',
    'FLT #',
    'AC type WB / NB',
    'International / Domestic',
    'Reason for hiring',
  ] as const;

  return (
    <div className="mt-6 flex w-full min-w-0 flex-col gap-6">
      <p className="text-[11px] font-medium text-slate-500 lg:hidden" role="note">
        Swipe sideways on each table to see all columns
      </p>
      {/* GSE / Man power hired */}
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white/90 shadow-sm ring-1 ring-emerald-900/[0.04]">
        <div className={sectionTitle}>GSE / Man power hired from other agency</div>
        <div className={cn(FRIS_REPORTS_TABLE_SCROLL_CLASS, 'border-t border-emerald-100/70')}>
          <table className="w-full min-w-[72rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Hire external GSE or manpower</caption>
            <thead>
              <tr>
                {hiredHeaderCols.map((h) => (
                  <th key={h} scope="col" className={thCenter}>
                    {h}
                  </th>
                ))}
                <th scope="col" className={cn(thCenter, 'min-w-[5.5rem]')}>
                  Add
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {HIRED_KEYS.map((key) => (
                  <td key={key} className={tdCell}>
                    <input
                      type="text"
                      value={hiredDraft[key]}
                      onChange={(e) => setHiredField(key, e.target.value)}
                      readOnly={key === 'date'}
                      className={cn(inputSm, key === 'date' && 'cursor-default bg-emerald-50/50')}
                      autoComplete="off"
                      aria-label={String(key)}
                    />
                  </td>
                ))}
                <td className={tdCell}>
                  <button
                    type="button"
                    onClick={addHiredRow}
                    className="w-full min-h-[2.25rem] rounded-md border border-emerald-300/80 bg-emerald-50/80 px-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100/90"
                  >
                    Add new
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={cn(FRIS_REPORTS_TABLE_SCROLL_CLASS, 'border-t border-emerald-100/70 bg-emerald-50/20')}>
          <table className="w-full min-w-[76rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className={cn(thCenter, 'w-10 min-w-[2.5rem]')}>
                  SNo
                </th>
                {hiredHeaderCols.map((h) => (
                  <th key={`l-${h}`} scope="col" className={thCenter}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hiredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className={cn(tdCell, 'px-3 py-6 text-center text-sm text-slate-500')}>
                    No lines yet. Use <strong className="text-slate-700">Add new</strong> above to record hires.
                  </td>
                </tr>
              ) : (
                hiredRows.map((r) => (
                  <tr key={r.id}>
                    <td className={cn(tdCell, 'bg-emerald-50/40 text-center text-xs font-medium text-emerald-950')}>
                      {r.sno}
                    </td>
                    {HIRED_KEYS.map((k) => (
                      <td key={k} className={tdCell}>
                        <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs text-emerald-950">
                          {r[k] || '—'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resource details */}
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white/90 shadow-sm ring-1 ring-emerald-900/[0.04]">
        <div className={sectionTitle}>Resource details</div>
        <div className={cn(FRIS_REPORTS_TABLE_SCROLL_CLASS, 'border-t border-emerald-100/70')}>
          <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Roster and presence by role</caption>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className={cn(thCenter, 'w-10 min-w-[2.5rem]')}>
                  S/NO
                </th>
                <th rowSpan={2} scope="col" className={cn(thBase, 'min-w-[8rem]')}>
                  Detail
                </th>
                <th colSpan={2} scope="colgroup" className={thCenter}>
                  Day shift
                </th>
                <th colSpan={2} scope="colgroup" className={thCenter}>
                  Night shift
                </th>
                <th rowSpan={2} scope="col" className={thCenter}>
                  Total rostered
                </th>
                <th rowSpan={2} scope="col" className={thCenter}>
                  Total present
                </th>
              </tr>
              <tr>
                <th scope="col" className={thCenter}>
                  Rostered
                </th>
                <th scope="col" className={thCenter}>
                  Reported
                </th>
                <th scope="col" className={thCenter}>
                  Rostered
                </th>
                <th scope="col" className={thCenter}>
                  Reported
                </th>
              </tr>
            </thead>
            <tbody>
              {RESOURCE_LABELS.map((label, ri) => (
                <tr key={label}>
                  <td className={cn(tdCell, 'bg-emerald-50/40 text-center text-xs font-medium text-emerald-950')}>
                    {ri + 1}
                  </td>
                  <td className={cn(tdCell, 'bg-emerald-50/25 px-2 text-left text-xs font-medium text-emerald-950')}>
                    {label}
                  </td>
                  {(['dayRostered', 'dayReported', 'nightRostered', 'nightReported', 'totalRostered', 'totalPresent'] as const).map(
                    (key) => (
                      <td key={key} className={tdCell}>
                        <input
                          type="text"
                          value={resourceCells[ri]?.[key] ?? ''}
                          onChange={(e) => setResCell(ri, key, e.target.value)}
                          className={inputSm}
                          autoComplete="off"
                          aria-label={`${label} ${key}`}
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff on leave */}
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white/90 shadow-sm ring-1 ring-emerald-900/[0.04]">
        <div className={sectionTitle}>Staff on leave</div>
        <div className={cn(FRIS_REPORTS_TABLE_SCROLL_CLASS, 'border-t border-emerald-100/70')}>
          <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Staff leave and absence</caption>
            <thead>
              <tr>
                {(['Name', 'E/Code', 'Desgn', 'Type of leave / absent', 'Reason', 'Shift', 'Remarks'] as const).map((h) => (
                  <th key={h} scope="col" className={thCenter}>
                    {h}
                  </th>
                ))}
                <th scope="col" className={cn(thCenter, 'min-w-[5.5rem]')}>
                  Add
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={leaveDraft.name}
                    onChange={(e) => setLeaveField('name', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={leaveDraft.eCode}
                    onChange={(e) => setLeaveField('eCode', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={leaveDraft.desgn}
                    onChange={(e) => setLeaveField('desgn', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={leaveDraft.leaveType}
                    onChange={(e) => setLeaveField('leaveType', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={leaveDraft.reason}
                    onChange={(e) => setLeaveField('reason', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={leaveDraft.shift}
                    onChange={(e) => setLeaveField('shift', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={leaveDraft.remarks}
                    onChange={(e) => setLeaveField('remarks', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <button
                    type="button"
                    onClick={addLeaveRow}
                    className="w-full min-h-[2.25rem] rounded-md border border-emerald-300/80 bg-emerald-50/80 px-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100/90"
                  >
                    Add new
                  </button>
                </td>
              </tr>
              {leaveRows.map((r) => (
                <tr key={r.id}>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.name || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.eCode || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.desgn || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.leaveType || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.reason || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.shift || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.remarks || '—'}</span>
                  </td>
                  <td className={tdCell} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GSE defects */}
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white/90 shadow-sm ring-1 ring-emerald-900/[0.04]">
        <div className={sectionTitle}>GSE defects</div>
        <div className={cn(FRIS_REPORTS_TABLE_SCROLL_CLASS, 'border-t border-emerald-100/70')}>
          <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Ground support equipment defects</caption>
            <thead>
              <tr>
                {(['GSE', 'Defects', 'Status', 'Remarks'] as const).map((h) => (
                  <th key={h} scope="col" className={thCenter}>
                    {h}
                  </th>
                ))}
                <th scope="col" className={cn(thCenter, 'min-w-[5.5rem]')}>
                  Add
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={defectDraft.gse}
                    onChange={(e) => setDefectField('gse', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={defectDraft.defects}
                    onChange={(e) => setDefectField('defects', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={defectDraft.status}
                    onChange={(e) => setDefectField('status', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <input
                    type="text"
                    value={defectDraft.remarks}
                    onChange={(e) => setDefectField('remarks', e.target.value)}
                    className={inputSm}
                    autoComplete="off"
                  />
                </td>
                <td className={tdCell}>
                  <button
                    type="button"
                    onClick={addDefectRow}
                    className="w-full min-h-[2.25rem] rounded-md border border-emerald-300/80 bg-emerald-50/80 px-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100/90"
                  >
                    Add new
                  </button>
                </td>
              </tr>
              {defectRows.map((r) => (
                <tr key={r.id}>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.gse || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.defects || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.status || '—'}</span>
                  </td>
                  <td className={tdCell}>
                    <span className="block min-h-[2.25rem] px-1.5 py-1 text-center text-xs">{r.remarks || '—'}</span>
                  </td>
                  <td className={tdCell} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save / Update */}
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-100/50 via-teal-50/40 to-emerald-50/50 px-4 py-3.5 shadow-sm">
        <button
          type="button"
          onClick={() =>
            toast.info('Save is not wired to the API yet.', {
              description: 'Payload can include hired rows, resource grid, leave, and defects.',
            })
          }
          className="rounded-lg border border-slate-300/80 bg-white px-5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() =>
            toast.info('Update is not wired to the API yet.', { description: 'Use after a saved report id exists.' })
          }
          className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-400/60"
        >
          Update
        </button>
      </div>
    </div>
  );
}
