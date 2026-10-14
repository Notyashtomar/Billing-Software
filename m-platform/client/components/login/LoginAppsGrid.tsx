'use client';

import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Boxes,
  Calendar,
  Car,
  CircleDot,
  Database,
  Eye,
  FilePenLine,
  Grid3x3,
  Handshake,
  LayoutDashboard,
  MapPinned,
  MessageSquare,
  Plane,
  Receipt,
  ShieldAlert,
  Sparkles,
  Ticket,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { createClientBwmsAppAccessEvaluator } from '@/lib/bwms-app-page-catalog';
import { cn } from '@/lib/utils';
import {
  buildAmsLoginHref,
  buildBatestLoginHref,
  buildBillingLoginHref,
  buildBillReceivablesLoginHref,
  buildChrLoginHref,
  buildCmsLoginHref,
  buildComplianceLoginHref,
  buildGemmLoginHref,
  buildHrLoginHref,
  buildManualsLoginHref,
  buildSafetyLoginHref,
  buildTrpLoginHref,
  buildUldLoginHref,
} from '@/lib/login-station-client';

type AppCard = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
};

export type LoginAppGroup = {
  id: string;
  title: string;
  shortTitle: string;
  icon: LucideIcon;
  cards: AppCard[];
};

export const LOGIN_APP_GROUPS: LoginAppGroup[] = [
  {
    id: 'safety-compliance',
    title: 'Safety & Compliance',
    shortTitle: 'Safety',
    icon: ShieldAlert,
    cards: [
      {
        id: 'safety-incident',
        label: 'Safety & Incident',
        description: 'Report and track safety events',
        icon: ShieldAlert,
        href: '/safety-incident/login',
      },
      {
        id: 'compliance',
        label: 'Compliance',
        description: 'Policies, checks, and audits',
        icon: MapPinned,
        href: '/compliance/login',
      },
      {
        id: 'manuals',
        label: 'Manuals',
        description: 'Operating manuals & compliance library',
        icon: Boxes,
        href: '/manuals/login',
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance & Billing',
    shortTitle: 'Finance',
    icon: Receipt,
    cards: [
      {
        id: 'billing-finance',
        label: 'Billing',
        description: 'Invoices, charges, and close',
        icon: Receipt,
        href: '/billing/login',
      },
      {
        id: 'do-money',
        label: 'DO Money',
        description: 'Delivery-order payments',
        icon: Database,
      },
      {
        id: 'bill-receivables',
        label: 'Bill Receivables',
        description: 'Collections and outstanding invoices',
        icon: Wallet,
        href: '/bill-receivables/login',
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    shortTitle: 'Ops',
    icon: Car,
    cards: [
      {
        id: 'fris',
        label: 'FRIS',
        description: 'Flight handling, advance, forms, reports',
        icon: Plane,
        href: '/fris',
      },
      {
        id: 'trp',
        label: 'TRP',
        description: 'Training roster & planning',
        icon: Users,
        href: '/trp/login',
      },
      { id: 'cms', label: 'CMS', description: 'Crew movement services', icon: Car, href: '/cms/login' },
      { id: 'aep', label: 'AEP', description: 'Airport entry permits', icon: Ticket },
      {
        id: 'ams',
        label: 'AMS',
        description: 'Aircraft maintenance support',
        icon: FilePenLine,
        href: '/ams/login',
      },
      {
        id: 'chr',
        label: 'CHR',
        description: 'Cargo Handling Request (Section-5)',
        icon: CircleDot,
        href: '/chr/login',
      },
      {
        id: 'ba-test',
        label: 'BA Test',
        description: 'Breath analyser testing',
        icon: MessageSquare,
        href: '/batest/login',
      },
      {
        id: 'uld',
        label: 'ULD',
        description: 'Unit load device tracking',
        icon: Boxes,
        href: '/uld/login',
      },
      { id: 'hired-gse', label: 'Hired GSE', description: 'Hired ground equipment', icon: Boxes },
      {
        id: 'maas-services',
        label: 'MAAS Services',
        description: 'Meet & assist services',
        icon: Boxes,
        href: '/maas/login',
      },
      {
        id: 'grooming-checklist',
        label: 'Grooming',
        description: 'Cabin grooming checklists',
        icon: Boxes,
        href: '/grooming',
      },
      { id: 'namaskar-services', label: 'Namaskar', description: 'Guest welcome services', icon: Handshake },
    ],
  },
  {
    id: 'admin-people',
    title: 'Admin & People',
    shortTitle: 'Admin',
    icon: UsersRound,
    cards: [
      {
        id: 'admin-panel-people',
        label: 'Admin Panel',
        description: 'Users, stations, and system controls',
        icon: LayoutDashboard,
        href: '/admin/dashboard',
      },
      {
        id: 'gemm',
        label: 'GEMM',
        description: 'General employee management',
        icon: UsersRound,
        href: '/gemm/login',
      },
      {
        id: 'log-data',
        label: 'Log Data',
        description: 'Activity and audit logs',
        icon: Eye,
        href: '/log-data',
      },
      {
        id: 'hr',
        label: 'HR',
        description: 'People and HR workflows',
        icon: Grid3x3,
        href: '/hr/login',
      },
      { id: 'meeting', label: 'Meeting', description: 'Meetings and rooms', icon: UsersRound },
      { id: 'calendar', label: 'Calendar', description: 'Shared team calendar', icon: Calendar },
    ],
  },
];

/** Hide BWMS tiles the signed-in user was not granted (admin BWMS tools). */
export function filterLoginAppGroupsByAccess(
  groups: LoginAppGroup[] = LOGIN_APP_GROUPS,
): LoginAppGroup[] {
  const mayUseApp = createClientBwmsAppAccessEvaluator();
  return groups
    .map((group) => ({
      ...group,
      cards: group.cards.filter((card) => mayUseApp(card.id)),
    }))
    .filter((group) => group.cards.length > 0);
}

type GlassTheme = {
  accent: string;
  accentSoft: string;
  glow: string;
  border: string;
  borderHover: string;
  iconBg: string;
  iconShadow: string;
  badge: string;
  pill: string;
  chip: string;
  ring: string;
};

/** Category accents for light glass cards. */
const GLASS_THEMES = {
  operations: {
    accent: '#059669',
    accentSoft: 'rgba(16,185,129,0.10)',
    glow: 'rgba(16,185,129,0.18)',
    border: 'rgba(148,163,184,0.45)',
    borderHover: 'rgba(52,211,153,0.65)',
    iconBg: 'linear-gradient(145deg, #10B981, #059669)',
    iconShadow: '0 6px 16px rgba(16,185,129,0.28)',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    pill: 'bg-emerald-500 shadow-emerald-500/35',
    chip: 'bg-emerald-100 text-emerald-700',
    ring: 'rgba(16,185,129,0.45)',
  },
  safety: {
    accent: '#D97706',
    accentSoft: 'rgba(245,158,11,0.10)',
    glow: 'rgba(245,158,11,0.16)',
    border: 'rgba(148,163,184,0.45)',
    borderHover: 'rgba(251,191,36,0.65)',
    iconBg: 'linear-gradient(145deg, #F59E0B, #D97706)',
    iconShadow: '0 6px 16px rgba(245,158,11,0.28)',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    pill: 'bg-amber-500 shadow-amber-500/35',
    chip: 'bg-amber-100 text-amber-700',
    ring: 'rgba(245,158,11,0.45)',
  },
  finance: {
    accent: '#0284C7',
    accentSoft: 'rgba(14,165,233,0.10)',
    glow: 'rgba(14,165,233,0.16)',
    border: 'rgba(148,163,184,0.45)',
    borderHover: 'rgba(56,189,248,0.65)',
    iconBg: 'linear-gradient(145deg, #0EA5E9, #0284C7)',
    iconShadow: '0 6px 16px rgba(2,132,199,0.28)',
    badge: 'bg-sky-50 text-sky-700 ring-sky-200',
    pill: 'bg-sky-500 shadow-sky-500/35',
    chip: 'bg-sky-100 text-sky-700',
    ring: 'rgba(14,165,233,0.45)',
  },
  admin: {
    accent: '#0D9488',
    accentSoft: 'rgba(20,184,166,0.10)',
    glow: 'rgba(20,184,166,0.16)',
    border: 'rgba(148,163,184,0.45)',
    borderHover: 'rgba(45,212,191,0.65)',
    iconBg: 'linear-gradient(145deg, #14B8A6, #0D9488)',
    iconShadow: '0 6px 16px rgba(13,148,136,0.28)',
    badge: 'bg-teal-50 text-teal-700 ring-teal-200',
    pill: 'bg-teal-500 shadow-teal-500/35',
    chip: 'bg-teal-100 text-teal-700',
    ring: 'rgba(20,184,166,0.45)',
  },
} as const satisfies Record<string, GlassTheme>;

type GlassThemeKey = keyof typeof GLASS_THEMES;

const GROUP_THEME: Record<string, GlassThemeKey> = {
  'safety-compliance': 'safety',
  finance: 'finance',
  operations: 'operations',
  'admin-people': 'admin',
};

const SWIPE_THRESHOLD_PX = 56;
/** Soft ease-in-out — clear, readable page slide between categories */
const SLIDE_EASE: [number, number, number, number] = [0.33, 0.05, 0.2, 1];
const SLIDE_DURATION = 0.44;
/** Soft settle for column waves — ease-out so columns feel intentional */
const COLUMN_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const COLUMN_REVEAL_DURATION = 0.26;
/** Start column reveal almost immediately after page slide starts */
const COLUMN_BASE_DELAY = 0.08;
/** Time between column waves (col 1 → col 2 → …) */
const COLUMN_STAGGER = 0.06;

/**
 * Full-width category page slide (carousel).
 * Enter/exit run together so old category pushes out while new slides in.
 */
const panelVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0.88,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0.88,
  }),
};

function cardsGridClass(count: number): string {
  if (count <= 2) return 'grid-cols-1 sm:grid-cols-2 max-w-3xl gap-4 sm:gap-5';
  if (count <= 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl gap-4 sm:gap-5';
  if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl gap-4 sm:gap-5';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-6xl gap-4 sm:gap-5';
}

/** Match Tailwind breakpoints used by cardsGridClass (SSR / first paint fallback) */
function resolveColumnCount(cardCount: number, width: number): number {
  if (cardCount <= 2) return width >= 640 ? 2 : 1;
  if (cardCount <= 6) {
    if (width >= 1024) return 3;
    if (width >= 640) return 2;
    return 1;
  }
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

/** Count how many items sit on the first row of a CSS grid (= live column count). */
function measureGridColumns(grid: HTMLElement): number {
  const items = grid.querySelectorAll<HTMLElement>(':scope > *');
  if (items.length === 0) return 1;
  if (items.length === 1) return 1;
  const firstTop = items[0]!.offsetTop;
  let cols = 1;
  for (let i = 1; i < items.length; i++) {
    if (items[i]!.offsetTop > firstTop + 2) break;
    cols += 1;
  }
  return Math.max(1, cols);
}

/**
 * Wave index for column-perfect reveal:
 * - Multi-col: every card in the same column shares the same wave
 * - Next (+1): left → right; Prev (−1): right → left (matches slide)
 * - Single col: top → bottom (row cascade)
 */
function getColumnWaveIndex(
  index: number,
  columnCount: number,
  direction: number,
): number {
  if (columnCount <= 1) return index;
  const col = index % columnCount;
  return direction >= 0 ? col : columnCount - 1 - col;
}

function columnRevealDelay(waveIndex: number): number {
  return COLUMN_BASE_DELAY + waveIndex * COLUMN_STAGGER;
}

const CARD_STATIC_ROUTE: Partial<Record<string, string>> = {
  'billing-finance': '/billing/login',
  trp: '/trp/login',
  'safety-incident': '/safety-incident/login',
  ams: '/ams/login',
  cms: '/cms/login',
  chr: '/chr/login',
  'ba-test': '/batest/login',
  'bill-receivables': '/bill-receivables/login',
  uld: '/uld/login',
  gemm: '/gemm/login',
  hr: '/hr/login',
  manuals: '/manuals/login',
  compliance: '/compliance/login',
};

const CARD_DYNAMIC_ROUTE_RESOLVER: Partial<Record<string, () => string>> = {
  'billing-finance': buildBillingLoginHref,
  trp: buildTrpLoginHref,
  'safety-incident': buildSafetyLoginHref,
  ams: buildAmsLoginHref,
  cms: buildCmsLoginHref,
  chr: buildChrLoginHref,
  'ba-test': buildBatestLoginHref,
  'bill-receivables': buildBillReceivablesLoginHref,
  uld: buildUldLoginHref,
  gemm: buildGemmLoginHref,
  hr: buildHrLoginHref,
  manuals: buildManualsLoginHref,
  compliance: buildComplianceLoginHref,
};

function GlassAppCard({
  card,
  themeKey,
  onSelect,
  reduceMotion,
  motionLocked,
}: {
  card: AppCard;
  themeKey: GlassThemeKey;
  onSelect?: (cardId: string) => void;
  reduceMotion: boolean | null;
  /** Disable hover lift while category is sliding — prevents wobble under cursor */
  motionLocked?: boolean;
}) {
  const Icon = card.icon;
  const theme = GLASS_THEMES[themeKey];
  const isLive = Boolean(card.href);

  const shellClass = cn(
    'group relative flex h-full min-h-[11.5rem] w-full flex-col overflow-hidden rounded-2xl text-left',
    'border border-slate-200/80 bg-white/85 backdrop-blur-md shadow-sm',
    'hover:bg-white hover:shadow-xl hover:border-emerald-300/60',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
    'sm:min-h-[12.5rem]',
    'transition-[background-color,border-color,box-shadow] duration-200 ease-out',
    'transform-gpu',
  );

  const shellStyle = {
    ['--glass-border-hover' as string]: theme.borderHover,
    ['--glass-glow' as string]: theme.glow,
    ['--glass-ring' as string]: theme.ring,
  };

  const content = (
    <>
      <span
        className="absolute inset-x-0 top-0 z-10 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
        }}
        aria-hidden
      />

      <span
        className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-70 blur-xl transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: theme.glow }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full opacity-50 blur-xl"
        style={{ background: theme.accentSoft }}
        aria-hidden
      />

      <span
        className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-slate-900/[0.04]"
        aria-hidden
      />

      <div className="relative z-[1] flex h-full flex-col justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
            <span
              className="absolute inset-0 rounded-2xl opacity-50 blur-md"
              style={{ background: theme.glow }}
              aria-hidden
            />
            <span
              className="relative flex h-full w-full items-center justify-center rounded-2xl border border-white/40 transition-transform duration-200 ease-out group-hover:scale-105"
              style={{
                background: theme.iconBg,
                boxShadow: theme.iconShadow,
              }}
            >
              <Icon className="h-5 w-5 text-white sm:h-6 sm:w-6" strokeWidth={1.85} aria-hidden />
            </span>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isLive && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset',
                  theme.badge,
                )}
              >
                <Sparkles className="h-2.5 w-2.5" aria-hidden />
                Live
              </span>
            )}
            <ArrowRight
              className="h-5 w-5 shrink-0 opacity-45 transition-[transform,opacity] duration-200 ease-out group-hover:translate-x-1.5 group-hover:opacity-100"
              style={{ color: theme.accent }}
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
        </div>

        <div className="min-w-0">
          <h4 className="text-[1.0625rem] font-bold leading-snug tracking-tight text-slate-900 sm:text-lg">
            {card.label}
          </h4>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{card.description}</p>
        </div>
      </div>
    </>
  );

  const hoverProps =
    reduceMotion || motionLocked
      ? {}
      : {
          whileHover: {
            y: -4,
            scale: 1.012,
            transition: { duration: 0.18, ease: 'easeOut' as const },
          },
          whileTap: {
            scale: 0.985,
            transition: { duration: 0.1 },
          },
        };

  if (card.href) {
    return (
      <motion.div
        className="h-full"
        {...hoverProps}
        style={{ transformOrigin: 'center' }}
      >
        <Link
          href={CARD_STATIC_ROUTE[card.id] ?? card.href}
          onClick={(e) => {
            onSelect?.(card.id);
            // Resolve at click so /login?stationCode=… from map is included.
            const resolveRoute = CARD_DYNAMIC_ROUTE_RESOLVER[card.id];
            if (resolveRoute) {
              e.preventDefault();
              window.location.assign(resolveRoute());
            }
          }}
          className={cn(shellClass, 'focus-visible:ring-[color:var(--glass-ring)]')}
          style={shellStyle}
          aria-label={`Open ${card.label}`}
        >
          {content}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="h-full"
      {...hoverProps}
      style={{ transformOrigin: 'center' }}
    >
      <button
        type="button"
        onClick={() => onSelect?.(card.id)}
        className={cn(
          shellClass,
          'focus-visible:ring-[color:var(--glass-ring)]',
          'cursor-default',
        )}
        style={shellStyle}
        aria-label={card.label}
      >
        {content}
      </button>
    </motion.div>
  );
}

const MemoGlassAppCard = memo(GlassAppCard);
MemoGlassAppCard.displayName = 'MemoGlassAppCard';

type CategoryNavProps = {
  activeId: string;
  onSelect: (groupId: string) => void;
  groups?: LoginAppGroup[];
  className?: string;
};

/** Pill category tabs with sliding active indicator + module count chips. */
export function LoginAppsCategoryNav({
  activeId,
  onSelect,
  groups: groupsProp,
  className,
}: CategoryNavProps) {
  const reduceMotion = useReducedMotion();
  const groups = groupsProp && groupsProp.length > 0 ? groupsProp : filterLoginAppGroupsByAccess();

  return (
    <nav
      className={cn(
        'mx-auto flex w-fit min-w-0 max-w-full items-center justify-center gap-1.5 overflow-x-auto overscroll-x-contain',
        'rounded-full border border-slate-200/80 bg-white/70 p-1.5 shadow-sm backdrop-blur-xl',
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label="App categories"
    >
      {groups.map((group) => {
        const Icon = group.icon;
        const themeKey = GROUP_THEME[group.id] ?? 'safety';
        const theme = GLASS_THEMES[themeKey];
        const selected = group.id === activeId;
        const count = group.cards.length;

        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelect(group.id)}
            aria-current={selected ? 'page' : undefined}
            title={group.title}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold',
              'border border-transparent transition-[color,transform,background-color,border-color] duration-150 ease-out',
              'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
              'sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm',
              selected
                ? 'text-white'
                : 'border-slate-300/50 bg-slate-200/60 text-slate-700 hover:bg-slate-200/90 hover:text-slate-900',
            )}
          >
            {selected && (
              <motion.span
                layoutId={reduceMotion ? undefined : 'activeCategoryPill'}
                className={cn('absolute inset-0 rounded-full shadow-lg', theme.pill)}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 420, damping: 32 }
                }
                aria-hidden
              />
            )}
            <Icon
              className="relative z-[1] h-3.5 w-3.5 sm:h-4 sm:w-4"
              strokeWidth={1.85}
              aria-hidden
            />
            <span className="relative z-[1] whitespace-nowrap">
              <span className="sm:hidden">{group.shortTitle}</span>
              <span className="hidden sm:inline">{group.title}</span>
            </span>
            <span
              className={cn(
                'relative z-[1] inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                selected ? 'bg-white/25 text-white' : theme.chip,
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

type LoginAppsGridProps = {
  onSelect?: (cardId: string) => void;
  activeId: string;
  /** +1 = next category (swipe left), -1 = previous (swipe right) */
  swipeDirection: number;
  onActiveIdChange: (groupId: string, direction: number) => void;
  visibleGroups?: LoginAppGroup[];
};

export default function LoginAppsGrid({
  onSelect,
  activeId,
  swipeDirection,
  onActiveIdChange,
  visibleGroups: visibleGroupsProp,
}: LoginAppsGridProps) {
  const reduceMotion = useReducedMotion();
  const visibleGroups =
    visibleGroupsProp && visibleGroupsProp.length > 0
      ? visibleGroupsProp
      : filterLoginAppGroupsByAccess();
  const activeIndex = Math.max(
    0,
    visibleGroups.findIndex((g) => g.id === activeId),
  );
  const active = visibleGroups[activeIndex] ?? visibleGroups[0];
  const cardCount = active?.cards.length ?? 0;
  const slideDir = swipeDirection >= 0 ? 1 : -1;

  const gridRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const dragReleaseAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const [revealCols, setRevealCols] = useState(() =>
    typeof window !== 'undefined' ? resolveColumnCount(cardCount, window.innerWidth) : 1,
  );
  /** Start column waves only after live grid columns are measured */
  const [revealReady, setRevealReady] = useState(false);
  const dragOffset = useMotionValue(0);
  /** Lock card hover lifts while the page is sliding / columns revealing */
  const [slideLock, setSlideLock] = useState(false);

  // Measure real CSS grid columns, then unlock the column-wave reveal.
  useLayoutEffect(() => {
    if (!active) return;

    if (reduceMotion) {
      setRevealReady(true);
      setSlideLock(false);
      return;
    }

    setRevealReady(false);
    setSlideLock(true);

    const grid = gridRef.current;
    const fallback = resolveColumnCount(cardCount, window.innerWidth);
    let measured = grid ? measureGridColumns(grid) : fallback;
    setRevealCols(measured);

    let cancelled = false;
    // Double-rAF: wait for layout paint so measured columns match the visible grid.
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      if (cancelled) return;
      if (gridRef.current) {
        measured = measureGridColumns(gridRef.current);
        setRevealCols(measured);
      }
      raf2 = window.requestAnimationFrame(() => {
        if (!cancelled) setRevealReady(true);
      });
    });

    const waveCount = measured <= 1 ? cardCount : measured;
    const revealTail =
      COLUMN_BASE_DELAY +
      Math.max(0, waveCount - 1) * COLUMN_STAGGER +
      COLUMN_REVEAL_DURATION;
    const lockMs = (Math.max(SLIDE_DURATION, revealTail) + 0.08) * 1000;
    const unlockTimer = window.setTimeout(() => {
      if (!cancelled) setSlideLock(false);
    }, lockMs);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(unlockTimer);
    };
  }, [activeId, cardCount, reduceMotion]);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= visibleGroups.length) return;
      if (nextIndex === activeIndex) return;
      const next = visibleGroups[nextIndex]!;
      onActiveIdChange(next.id, nextIndex > activeIndex ? 1 : -1);
    },
    [activeIndex, onActiveIdChange, visibleGroups],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (slideLock) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, button')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, active: true };
    dragReleaseAnimationRef.current?.stop();
    dragOffset.set(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start?.active) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      start.active = false;
      dragOffset.set(0);
      return;
    }
    const atStart = activeIndex === 0 && dx > 0;
    const atEnd = activeIndex === visibleGroups.length - 1 && dx < 0;
    const resisted = atStart || atEnd ? dx * 0.28 : dx;
    dragOffset.set(resisted);
  };

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const dx = dragOffset.get();
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
      // Instant clear — avoids fighting the category page slide.
      dragOffset.set(0);
      if (dx < 0) goToIndex(activeIndex + 1);
      else goToIndex(activeIndex - 1);
      return;
    }
    dragReleaseAnimationRef.current = animate(dragOffset, 0, {
      duration: 0.28,
      ease: [0.25, 0.1, 0.25, 1],
    });
  };

  if (!active) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center px-6 text-center text-sm text-slate-600">
        No BWMS tools are enabled for your account at this station. Ask an admin to grant access.
      </div>
    );
  }

  const themeKey = GROUP_THEME[active.id] ?? 'safety';
  // Horizontal only — no vertical rise (keeps reveal on a straight line)
  const enterX = slideDir > 0 ? 20 : -20;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <motion.div
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden [contain:layout_paint]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        style={{ x: dragOffset, willChange: 'transform' }}
      >
        <AnimatePresence initial={false} custom={swipeDirection} mode="sync">
          <motion.div
            key={active.id}
            custom={swipeDirection}
            variants={reduceMotion ? undefined : panelVariants}
            initial={reduceMotion ? false : 'enter'}
            animate="center"
            exit={reduceMotion ? undefined : 'exit'}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    x: { type: 'tween', duration: SLIDE_DURATION, ease: SLIDE_EASE },
                    opacity: { duration: SLIDE_DURATION * 0.7, ease: 'easeOut' },
                  }
            }
            className="absolute inset-0 h-full transform-gpu overflow-y-auto overscroll-contain px-1 py-1 sm:px-2 sm:py-2 will-change-transform"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <ul
              ref={gridRef}
              className={cn('mx-auto grid w-full', cardsGridClass(active.cards.length))}
              aria-label={active.title}
            >
              {active.cards.map((card, index) => {
                const wave = getColumnWaveIndex(index, revealCols, slideDir);
                const delay = columnRevealDelay(wave);
                // Straight-line reveal: opacity + horizontal only (no bottom→up y)
                const hiddenState = { opacity: 0.4, x: enterX };
                const shownState = { opacity: 1, x: 0 };

                return (
                  <motion.li
                    key={card.id}
                    className="min-w-0 transform-gpu"
                    initial={reduceMotion ? false : hiddenState}
                    animate={
                      reduceMotion || revealReady ? shownState : hiddenState
                    }
                    exit={{
                      opacity: 1,
                      x: 0,
                      transition: { duration: 0 },
                    }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            duration: COLUMN_REVEAL_DURATION,
                            ease: COLUMN_EASE,
                            delay: revealReady ? delay : 0,
                          }
                    }
                  >
                    <MemoGlassAppCard
                      card={card}
                      themeKey={themeKey}
                      onSelect={onSelect}
                      reduceMotion={reduceMotion}
                      motionLocked={slideLock}
                    />
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
