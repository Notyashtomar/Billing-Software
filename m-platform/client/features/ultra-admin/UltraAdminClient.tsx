'use client';

/**
 * ULTRA ADMIN PANEL — INTERNAL STEALTH TOOL
 *
 * This panel is accessible only by navigating directly to /ultraadm.
 * It is not linked, indexed, or referenced anywhere in the application UI.
 * It is not protected by middleware — access control is the PIN gate below.
 * Do NOT add this path to middleware.ts, nav configs, or any sitemap.
 *
 * The PIN is intentionally hardcoded here. Rotate it by changing ULTRA_ADMIN_PIN.
 * PIN state lives in React state only — never localStorage or sessionStorage.
 * Closing the tab requires the PIN again. There is no server cookie or route guard.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  HeartPulse,
  Hexagon,
  LayoutGrid,
  Lock,
  Plane,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

const ULTRA_ADMIN_PIN = '291845';

const FRIS_PROFILE_KEYS = [
  'userid',
  'userId',
  'userName',
  'username',
  'userEmail',
  'userRole',
  'userDepartment',
  'userFlags',
  'userPermissionScope',
  'userLandingPath',
  'userAppAccess',
  'userAppPageAccess',
  'bwmsEntryApp',
  'userStationId',
  'userStationCode',
  'userStationCity',
  'isAuthenticated',
  'user_role',
  'userGender',
  'userJoiningDate',
  'userDesignation',
  'userEmployeeId',
  'userPhone',
  'userCompany',
  'userLocation',
  'userAirport',
  'userDepartmentLabel',
  'userSubDepartment',
] as const;

const SESSION_WATCH_KEYS = [
  'userid',
  'userRole',
  'userName',
  'userStationCode',
  'userStationId',
] as const;

const PERMISSION_SUB_PAGES = [
  'dashboard',
  'creation',
  'advance',
  'flights',
  'reports',
  'mis',
  'others',
] as const;

/** Leaf keys under each tab. Grant All writes every leaf as 1. */
const TAB_SUB_KEYS: Record<(typeof PERMISSION_SUB_PAGES)[number], readonly string[]> = {
  dashboard: ['Dashboard page'],
  creation: ['Scheduled Airlines', 'Additional Flights', 'RAF'],
  advance: [
    'Gateway',
    'Scheduled Airlines',
    'Airline',
    'Aircraft',
    'Equipment',
    'Manpower',
    'Staff',
    'Airline Contact',
    'Logo of Airline',
    'Raf Airline',
    'Non Scheduled Airline',
    'Terminal',
    'Other Services',
    'DCS Master',
    'Aircraft Registration',
    'AMS Services',
    'Schedule Setup',
    'Schedule Equipment Setup',
    'Cargo',
    'Create New Cargo Airline',
    'Create New Scheduled',
    'Services',
    'Flight Creation',
    'Unit Master',
    'GH Representative',
    'Invoicing',
    'Scheduled Flight Data',
    'Cleaning Services',
    'Non Scheduled Flight Data',
    'MAAS Services',
    'RAF (Ramp Assistance Forms)',
    'Cancel Scheduled Flight Data',
    'Cancel Non Scheduled Flight Data',
    'Handling Status Report',
    'Alert Setup',
  ],
  flights: [
    'Scheduled Airlines',
    'FHR Report',
    'GSE Report',
    'Team Report',
    'Scheduled Data Export',
    'MIS Scheduled Flights',
    'Cancellation History',
    'Non-Scheduled Airlines',
    'Non scheduled Booking',
    'Booking Details',
    'Non-Scheduled Data',
    'MIS Non-Scheduled Flights',
    'Non-Scheduled Cancellation History',
    'Flight Schedule',
    'Peak Flights',
    'RAF (Ramp Assistance Forms)',
  ],
  reports: [
    'Pax Shift Report',
    'Pax Shift Analysis Report',
    'Ramp Shift Report',
    'GSD Shift Report',
    'Quality Report',
    'Missing FHR Report',
    'Delay Report',
    'Cleaning Services',
    'Consolidated Report',
    'Scheduled FHR Report',
    'Non Scheduled FHR Report',
  ],
  mis: [
    'MIS Station Wise',
    'MIS Airline Wise',
    'MIS Month Wise',
    'MIS Remarks',
    'MIS RAF',
    'MIS BHS',
    'MIS ADS',
    'MIS Checker',
  ],
  others: ['others'],
};

const NAV_TILES: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/fris/dashboard', label: 'FRIS Dashboard', icon: LayoutGrid },
  { href: '/trp', label: 'TRP', icon: GraduationCap },
  { href: '/hr/hub', label: 'HR Hub', icon: Users },
  { href: '/admin/dashboard', label: 'Admin Panel', icon: ShieldCheck },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/grooming', label: 'Grooming', icon: Sparkles },
  { href: '/safety-incident', label: 'Safety Incident', icon: AlertTriangle },
  { href: '/compliance', label: 'Compliance', icon: ClipboardCheck },
  { href: '/log-data', label: 'Log Data', icon: ScrollText },
  { href: '/uld', label: 'ULD', icon: Boxes },
  { href: '/ams', label: 'AMS', icon: Plane },
  { href: '/maas', label: 'MAAS', icon: Hexagon },
  { href: '/manuals', label: 'Manuals', icon: BookOpen },
  { href: '/gemm', label: 'GEMM', icon: Hexagon },
  { href: '/chr', label: 'CHR', icon: HeartPulse },
];

const INSPECT_KEYS = ['userFlags', 'userAppPageAccess', 'userPermissionScope'] as const;

type RoleChoice = '' | 'superadmin' | 'manager' | 'employee';

type InjectForm = {
  userid: string;
  userRole: RoleChoice;
  userName: string;
  userStationCode: string;
  userStationId: string;
};

const EMPTY_FORM: InjectForm = {
  userid: '',
  userRole: '',
  userName: '',
  userStationCode: '',
  userStationId: '',
};

type SectionId = 'overview' | 'inject' | 'navigate' | 'flags' | 'danger';

function notifySessionChange() {
  window.dispatchEvent(new Event('fris-session-updated'));
  window.dispatchEvent(new Event('storage'));
}

function maskStorageValue(key: string, value: string): string {
  if (/token|password|secret/i.test(key)) {
    return value ? '••••••••' : '';
  }
  return value;
}

function readStorageRows(): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    rows.push({
      key,
      value: maskStorageValue(key, localStorage.getItem(key) ?? ''),
    });
  }
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

function readKey(key: string): string {
  return localStorage.getItem(key) ?? '';
}

function clearProfileKeys() {
  for (const key of FRIS_PROFILE_KEYS) {
    localStorage.removeItem(key);
  }
}

function writeFilled(form: InjectForm) {
  const entries: [string, string][] = [
    ['userid', form.userid.trim()],
    ['userRole', form.userRole],
    ['userName', form.userName.trim()],
    ['userStationCode', form.userStationCode.trim()],
    ['userStationId', form.userStationId.trim()],
  ];
  for (const [key, value] of entries) {
    if (value) localStorage.setItem(key, value);
  }
  notifySessionChange();
}

function grantAllFlags() {
  const flags: Record<string, Record<string, number>> = {};
  for (const tab of PERMISSION_SUB_PAGES) {
    const leaves: Record<string, number> = {};
    for (const leaf of TAB_SUB_KEYS[tab]) {
      leaves[leaf] = 1;
    }
    flags[tab] = leaves;
  }
  localStorage.setItem('userFlags', JSON.stringify(flags));
  notifySessionChange();
}

function parseStored(raw: string | null): unknown {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function colorizeJson(value: unknown): React.ReactNode {
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value, null, 2);
  if (text == null) return <span style={{ color: '#64748b' }}>null</span>;
  const parts: React.ReactNode[] = [];
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[1] && match[2]) {
      parts.push(
        <span key={i} style={{ color: '#6366f1' }}>
          {match[1]}
        </span>,
      );
      i += 1;
      parts.push(match[2]);
    } else if (match[1]) {
      parts.push(
        <span key={i} style={{ color: '#22c55e' }}>
          {match[1]}
        </span>,
      );
    } else if (match[3]) {
      parts.push(
        <span key={i} style={{ color: '#f59e0b' }}>
          {match[3]}
        </span>,
      );
    } else if (match[4]) {
      parts.push(
        <span key={i} style={{ color: '#64748b' }}>
          {match[4]}
        </span>,
      );
    }
    i += 1;
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const cardStyle: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid rgba(255,255,255,0.06)',
  backdropFilter: 'blur(8px)',
};

function Accordion({
  id,
  title,
  hint,
  open,
  onToggle,
  danger,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const panelId = `${id}-panel`;
  return (
    <section
      className="overflow-hidden rounded-2xl"
      style={{
        ...cardStyle,
        background: danger ? 'rgba(239,68,68,0.08)' : cardStyle.background,
        border: danger ? '1px solid rgba(239,68,68,0.35)' : cardStyle.border,
      }}
    >
      <h2 className="m-0">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="min-w-0 flex-1">
            <span
              className="block text-sm font-medium tracking-wide"
              style={{ color: danger ? '#ef4444' : '#f1f5f9' }}
            >
              {title}
            </span>
            <span className="mt-0.5 block text-xs" style={{ color: '#64748b' }}>
              {hint}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 transition-transform duration-200"
            style={{
              color: '#64748b',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 sm:px-5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export default function UltraAdminClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [denied, setDenied] = useState(false);
  const [shake, setShake] = useState(0);
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    overview: true,
    inject: false,
    navigate: false,
    flags: false,
    danger: false,
  });
  const [rows, setRows] = useState<{ key: string; value: string }[]>([]);
  const [sessionSnap, setSessionSnap] = useState<Record<string, string>>({});
  const [appAccess, setAppAccess] = useState('');
  const [flagBlocks, setFlagBlocks] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState<InjectForm>(EMPTY_FORM);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pinLabelId = useId();

  const refresh = useCallback(() => {
    const nextSession: Record<string, string> = {};
    for (const key of SESSION_WATCH_KEYS) {
      const primary = readKey(key);
      nextSession[key] =
        key === 'userid' && !primary ? readKey('userId') : primary;
    }
    setRows(readStorageRows());
    setSessionSnap(nextSession);
    setAppAccess(readKey('userAppAccess'));
    const blocks: Record<string, unknown> = {};
    for (const key of INSPECT_KEYS) {
      blocks[key] = parseStored(localStorage.getItem(key));
    }
    setFlagBlocks(blocks);
  }, []);

  useEffect(() => {
    if (!unlocked) {
      inputRef.current?.focus();
      return;
    }
    refresh();
    const timer = window.setInterval(refresh, 2000);
    const onChange = () => refresh();
    window.addEventListener('fris-session-updated', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('fris-session-updated', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [unlocked, refresh, shake]);

  function submitPin(next: string) {
    if (next === ULTRA_ADMIN_PIN) {
      setDenied(false);
      setPin('');
      setUnlocked(true);
      return;
    }
    setDenied(true);
    setShake((n) => n + 1);
    setPin('');
  }

  function onPinChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    if (denied) setDenied(false);
    if (digits.length === 6) submitPin(digits);
  }

  function lockPanel() {
    setUnlocked(false);
    setPin('');
    setDenied(false);
    setNotice('');
  }

  function toggle(id: SectionId) {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen" style={{ background: '#030712', color: '#f1f5f9' }}>
        <AnimatePresence mode="wait">
          {!unlocked ? (
            <motion.div
              key="gate"
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
              style={{ background: '#030712' }}
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <motion.div
                key={shake}
                animate={shake ? { x: [0, -12, 12, -8, 8, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.42 }}
                className="w-full max-w-sm rounded-2xl px-3 py-6 sm:p-8"
                style={cardStyle}
              >
                <p
                  id={pinLabelId}
                  className="text-center text-xs font-medium tracking-[0.3em] uppercase"
                  style={{ color: '#6366f1' }}
                >
                  Access code
                </p>
                <div
                  className="relative mt-6 flex justify-center gap-1.5 sm:gap-2"
                  onClick={() => inputRef.current?.focus()}
                >
                  <input
                    ref={inputRef}
                    value={pin}
                    onChange={(event) => onPinChange(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-labelledby={pinLabelId}
                    aria-invalid={denied}
                    className="absolute inset-0 cursor-text opacity-0"
                  />
                  {Array.from({ length: 6 }, (_, index) => {
                    const filled = index < pin.length;
                    const active = index === pin.length;
                    return (
                      <div
                        key={index}
                        aria-hidden
                        className="flex items-center justify-center font-mono text-xl"
                        style={{
                          width: 'clamp(40px, 12vw, 48px)',
                          height: 56,
                          background: '#0d1117',
                          color: '#f1f5f9',
                          border: '2px solid #6366f1',
                          borderRadius: 10,
                          boxShadow: active ? '0 0 12px rgba(99,102,241,0.6)' : 'none',
                        }}
                      >
                        {filled ? pin[index] : ''}
                      </div>
                    );
                  })}
                </div>
                <p
                  className="mt-4 min-h-5 text-center text-sm"
                  role="alert"
                  style={{ color: '#ef4444' }}
                >
                  {denied ? 'Access Denied' : ''}
                </p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="dash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <header
                className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 sm:px-6"
                style={{
                  background: 'rgba(3,7,18,0.92)',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-xs font-medium tracking-[0.3em] uppercase sm:text-sm"
                    style={{ color: '#6366f1' }}
                  >
                    ◈ Ultra Control
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: '#64748b' }}>
                    v0.1
                  </span>
                </div>
                <button
                  type="button"
                  onClick={lockPanel}
                  aria-label="Lock this panel"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg"
                  style={{ color: '#64748b' }}
                >
                  <Lock className="h-4 w-4" />
                </button>
              </header>

              <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pt-20 pb-16 sm:px-6">
                <Accordion
                  id="overview"
                  title="System Overview"
                  hint="Browser storage and current profile keys"
                  open={open.overview}
                  onToggle={() => toggle('overview')}
                >
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {SESSION_WATCH_KEYS.map((key) => (
                      <div key={key} className="min-w-0">
                        <dt className="text-xs" style={{ color: '#64748b' }}>
                          {key}
                        </dt>
                        <dd className="truncate font-mono text-sm" style={{ color: '#f1f5f9' }}>
                          {sessionSnap[key] || '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-xs" style={{ color: '#64748b' }}>
                    userAppAccess
                  </p>
                  <pre
                    className="mt-1 max-h-40 overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap"
                    style={{ background: '#030712', color: '#f1f5f9' }}
                  >
                    {colorizeJson(parseStored(appAccess) ?? '—')}
                  </pre>
                  <p className="mt-4 text-xs" style={{ color: '#64748b' }}>
                    localStorage
                  </p>
                  {rows.length === 0 ? (
                    <p className="mt-2 font-mono text-sm" style={{ color: '#64748b' }}>
                      No keys stored.
                    </p>
                  ) : (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[32rem] border-collapse font-mono text-xs">
                        <thead>
                          <tr style={{ color: '#64748b' }}>
                            <th className="py-2 pr-3 text-left font-medium">key</th>
                            <th className="py-2 text-left font-medium">value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                              <td className="py-2 pr-3 align-top" style={{ color: '#6366f1' }}>
                                {row.key}
                              </td>
                              <td className="max-w-md py-2 align-top break-all" style={{ color: '#f1f5f9' }}>
                                {row.value || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Accordion>

                <Accordion
                  id="inject"
                  title="Impersonate / Inject Session"
                  hint="Write profile keys in this browser"
                  open={open.inject}
                  onToggle={() => toggle('inject')}
                >
                  <p className="mb-4 text-xs leading-relaxed" style={{ color: '#64748b' }}>
                    Filled fields write to localStorage and notify listeners in this tab.
                    Protected routes still require the server session cookie.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field
                      label="userid"
                      value={form.userid}
                      onChange={(userid) => setForm((prev) => ({ ...prev, userid }))}
                    />
                    <label className="block text-xs" style={{ color: '#64748b' }}>
                      userRole
                      <select
                        value={form.userRole}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            userRole: event.target.value as RoleChoice,
                          }))
                        }
                        className="mt-1 h-11 w-full rounded-lg px-3 font-mono text-sm outline-none"
                        style={{
                          background: '#030712',
                          color: '#f1f5f9',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <option value="">Select role</option>
                        <option value="superadmin">superadmin</option>
                        <option value="manager">manager</option>
                        <option value="employee">employee</option>
                      </select>
                    </label>
                    <Field
                      label="userName"
                      value={form.userName}
                      onChange={(userName) => setForm((prev) => ({ ...prev, userName }))}
                    />
                    <Field
                      label="userStationCode"
                      value={form.userStationCode}
                      onChange={(userStationCode) =>
                        setForm((prev) => ({ ...prev, userStationCode }))
                      }
                    />
                    <Field
                      label="userStationId"
                      value={form.userStationId}
                      onChange={(userStationId) =>
                        setForm((prev) => ({ ...prev, userStationId }))
                      }
                    />
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <ActionButton
                      tone="accent"
                      onClick={() => {
                        writeFilled(form);
                        setNotice('Session keys written.');
                        refresh();
                      }}
                    >
                      Inject to localStorage
                    </ActionButton>
                    <ActionButton
                      tone="muted"
                      onClick={() => {
                        clearProfileKeys();
                        notifySessionChange();
                        setNotice('Session keys cleared.');
                        refresh();
                      }}
                    >
                      Clear Session
                    </ActionButton>
                    <ActionButton
                      tone="success"
                      onClick={() => {
                        localStorage.setItem('userid', 'supadm123');
                        localStorage.setItem('userRole', 'superadmin');
                        localStorage.setItem('isAuthenticated', 'true');
                        notifySessionChange();
                        setNotice('Universal superadmin keys written.');
                        refresh();
                      }}
                    >
                      Inject Universal Superadmin
                    </ActionButton>
                  </div>
                  <p className="mt-3 min-h-5 text-sm" role="status" style={{ color: '#22c55e' }}>
                    {notice}
                  </p>
                </Accordion>

                <Accordion
                  id="navigate"
                  title="Quick Navigate"
                  hint="Opens in this tab so injected keys stay"
                  open={open.navigate}
                  onToggle={() => toggle('navigate')}
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {NAV_TILES.map((tile) => {
                      const Icon = tile.icon;
                      return (
                        <Link
                          key={tile.href}
                          href={tile.href}
                          className="flex min-h-20 flex-col justify-between rounded-xl p-3 transition-all duration-200 hover:scale-[1.04]"
                          style={{
                            background: '#030712',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: '#f1f5f9',
                          }}
                          onMouseEnter={(event) => {
                            event.currentTarget.style.borderColor = '#6366f1';
                          }}
                          onMouseLeave={(event) => {
                            event.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                          }}
                          onFocus={(event) => {
                            event.currentTarget.style.borderColor = '#6366f1';
                          }}
                          onBlur={(event) => {
                            event.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                          }}
                        >
                          <Icon className="h-4 w-4" style={{ color: '#6366f1' }} aria-hidden />
                          <span className="mt-3 text-sm">{tile.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </Accordion>

                <Accordion
                  id="flags"
                  title="Feature Flags Inspector"
                  hint="userFlags, userAppPageAccess, userPermissionScope"
                  open={open.flags}
                  onToggle={() => toggle('flags')}
                >
                  <div className="mb-3">
                    <ActionButton
                      tone="accent"
                      onClick={() => {
                        grantAllFlags();
                        setNotice('All tab leaves set to 1.');
                        refresh();
                      }}
                    >
                      Grant All Flags
                    </ActionButton>
                  </div>
                  <div className="flex flex-col gap-3">
                    {INSPECT_KEYS.map((key) => (
                      <div key={key}>
                        <p className="text-xs" style={{ color: '#64748b' }}>
                          {key}
                        </p>
                        <pre
                          className="mt-1 max-h-64 overflow-auto rounded-lg p-3 font-mono text-xs leading-relaxed"
                          style={{ background: '#030712', color: '#f1f5f9' }}
                        >
                          {colorizeJson(flagBlocks[key] ?? null)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </Accordion>

                <Accordion
                  id="danger"
                  title="Danger Zone"
                  hint="Logout clears keys and reloads. Lock only hides this panel."
                  open={open.danger}
                  onToggle={() => toggle('danger')}
                  danger
                >
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <ActionButton
                      tone="danger"
                      onClick={() => {
                        clearProfileKeys();
                        window.location.reload();
                      }}
                    >
                      Force Logout All Sessions
                    </ActionButton>
                    <ActionButton tone="muted" onClick={lockPanel}>
                      Lock This Panel
                    </ActionButton>
                  </div>
                </Accordion>
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs" style={{ color: '#64748b' }}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        className="mt-1 h-11 w-full rounded-lg px-3 font-mono text-sm outline-none"
        style={{
          background: '#030712',
          color: '#f1f5f9',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      />
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'accent' | 'muted' | 'success' | 'danger';
}) {
  const styles: Record<typeof tone, React.CSSProperties> = {
    accent: { background: '#6366f1', color: '#f1f5f9', border: '1px solid #6366f1' },
    muted: {
      background: 'transparent',
      color: '#f1f5f9',
      border: '1px solid rgba(255,255,255,0.06)',
    },
    success: { background: '#22c55e', color: '#030712', border: '1px solid #22c55e' },
    danger: { background: '#ef4444', color: '#f1f5f9', border: '1px solid #ef4444' },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium"
      style={styles[tone]}
    >
      {children}
    </button>
  );
}
