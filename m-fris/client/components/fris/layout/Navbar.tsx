// components/Navbar.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Menu,
  Moon,
  Sun,
  X,
  ChevronDown,
  Plane,
  BarChart3,
  Home,
  User,
  LogOut,
  Ticket,
  FileText,
  Calendar,
  Clock,
  Download,
  PieChart,
  AlertCircle,
  Database,
  BookOpen,
  History,
  TrendingUp,
  Shield,
  Users,
  PlusCircle,
  Sliders,
  Sparkles,
  Layers,
  LineChart,
  Luggage,
  MessageSquare,
  Package,
  Radio,
  ClipboardList,
  FileStack,
  CheckSquare,
  FileCheck,
  Trash2,
  Tags,
  Percent,
  ArrowLeftRight,
  Wrench,
  UsersRound,
  Settings,
  LayoutDashboard,
  ScrollText,
  GitBranch,
  CalendarRange,
  PowerOff,
  Megaphone,
  CircleDollarSign,
  FileSpreadsheet,
  MapPin,
} from 'lucide-react';
import {
  MIS_AIRLINE_WISE_NAV_LABEL,
  MIS_DEFAULT_PATH,
  MIS_MONTH_WISE_NAV_LABEL,
  MIS_PAGES,
  MIS_STATION_WISE_NAV_LABEL,
  misNestedNavLabelForPath,
  misPagePermissionLabel,
} from '@/features/fris/mis/mis-pages';
import {
  filterNavItemByFlags,
  type UserNavFlags,
} from '@/lib/nav-permissions';
import { useFrisNavFlags } from '@/lib/use-fris-nav-flags';
import { RaiseTicketDialog } from '@/components/fris/layout/RaiseTicketDialog';
import { ChangeStationDialog } from '@/components/fris/layout/ChangeStationDialog';
import { EmployeeProfilePanel } from '@/components/fris/layout/EmployeeProfilePanel';
import { logoutFrisToStationMap, normalizeFrisUserRole, FRIS_SESSION_UPDATED_EVENT } from '@/lib/fris-session';
import { StationCompanyLogo } from '@/components/fris/layout/StationCompanyLogo';
import {
  formatLoginStationDisplay,
  getStoredLoginStationContext,
  persistLoginStationContext,
} from '@/lib/station-company-logo';
import { buildTicketNavSections } from '@/lib/ticket-nav-pages';
import { FRIS_HIDDEN_SCROLLBAR_CLASS } from '@/lib/fris-responsive-nav';
import {
  DASHBOARD_PATH,
  isDashboardFlightScopeHrefActive,
} from '@/lib/dashboardFlightScope';
import { isBillingNavbarChrome } from '@/lib/bwms-app-tools';
import {
  DEPLOYED_SCHEDULED_AIRLINES_PATH,
  billingFrisHref,
} from '@/lib/deployed-fris';
import {
  billingPageIdFromHref,
  clientMayUseBwmsAppPage,
} from '@/lib/bwms-app-page-catalog';
import {
  BILLING_INSIGHTS_NAV,
  BILLING_MASTER_NAV,
  BILLING_OTHERS_NAV,
  BILLING_SOURCES_NAV,
  BILLING_WORKFLOW_NAV,
} from '@/components/billing/billingAppNav';

/** Billing Advance / Flights open the live scheduled-airlines page in a new tab. */
function AppNavLink({
  href,
  className,
  onClick,
  children,
  role,
}: {
  href: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  role?: string;
}) {
  if (/^https?:\/\//i.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        role={role}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return (
    <NextLink href={href} className={className} role={role} onClick={onClick}>
      {children}
    </NextLink>
  );
}

/** Billed Services family — grant any sibling so tab does not vanish. */
const BILLING_SOURCES_PAGE_IDS = [
  'billed-services',
  'scheduled-flights',
  'ads',
  'equipment',
  'manpower',
  'raf',
  'uld',
  'ebc',
  'oth',
  'maas',
] as const;

function mayUseBillingHref(href: string): boolean {
  const path = href.split('?')[0] ?? href;
  if (path === '/billing/prep-dashboard') {
    return (
      clientMayUseBwmsAppPage('billing-finance', 'preparation') ||
      clientMayUseBwmsAppPage('billing-finance', 'prep-dashboard') ||
      clientMayUseBwmsAppPage('billing-finance', 'dashboard')
    );
  }
  if (
    path === '/billing/billed-services' ||
    path === '/billing/raf' ||
    path === '/billing/uld' ||
    path === '/billing/ebc' ||
    path === '/billing/oth' ||
    path === '/billing/maas'
  ) {
    return BILLING_SOURCES_PAGE_IDS.some((id) =>
      clientMayUseBwmsAppPage('billing-finance', id),
    );
  }
  // Insights: new pages — also allow anyone with Master dashboard / invoices (legacy page maps).
  if (path.startsWith('/billing/insights/')) {
    const pageId = billingPageIdFromHref(path);
    return (
      (pageId != null &&
        clientMayUseBwmsAppPage('billing-finance', pageId)) ||
      clientMayUseBwmsAppPage('billing-finance', 'dashboard') ||
      clientMayUseBwmsAppPage('billing-finance', 'invoices') ||
      clientMayUseBwmsAppPage('billing-finance', 'prep-dashboard')
    );
  }
  if (
    path === '/billing/royalty-setup' ||
    path === '/billing/aircraft-master' ||
    path === '/billing/equipment-master'
  ) {
    const pageId = billingPageIdFromHref(path);
    return (
      (pageId != null && clientMayUseBwmsAppPage('billing-finance', pageId)) ||
      clientMayUseBwmsAppPage('billing-finance', 'settings')
    );
  }
  const pageId = billingPageIdFromHref(href);
  if (!pageId) return false;
  return clientMayUseBwmsAppPage('billing-finance', pageId);
}

function filterBillingNavLinks(
  links: readonly { href: string; label: string }[],
): { href: string; label: string }[] {
  return links.flatMap((link) => {
    if (link.href === '/billing/customers') {
      if (mayUseBillingHref('/billing/customers')) return [link];
      if (mayUseBillingHref('/billing/service-catalog')) {
        return [{ ...link, href: '/billing/service-catalog' }];
      }
      return [];
    }
    if (link.href === '/billing/rate-cards') {
      return mayUseBillingHref('/billing/rate-cards') ? [link] : [];
    }
    return mayUseBillingHref(link.href) ? [link] : [];
  });
}

function billingDropdownIcon(href: string): React.ReactNode {
  const cls = 'w-3 h-3';
  switch (href) {
    case '/billing/dashboard':
    case '/billing/prep-dashboard':
    case '/billing/billed-services':
    case '/billing/insights/payables':
      return <LayoutDashboard className={cls} />;
    case '/billing/customers':
      return <Users className={cls} />;
    case '/billing/kyc':
      return <ClipboardList className={cls} />;
    case '/billing/service-catalog':
    case '/billing/ads':
    case '/billing/uld':
      return <Package className={cls} />;
    case '/billing/ebc':
      return <Luggage className={cls} />;
    case '/billing/oth':
      return <Layers className={cls} />;
    case '/billing/contracts':
    case '/billing/backing-sheets':
      return <FileText className={cls} />;
    case '/billing/concessions':
      return <Percent className={cls} />;
    case '/billing/rate-cards':
      return <Tags className={cls} />;
    case '/billing/conversion-rates':
      return <ArrowLeftRight className={cls} />;
    case '/billing/settings':
      return <Settings className={cls} />;
    case '/billing/royalty-setup':
      return <Percent className={cls} />;
    case '/billing/aircraft-master':
      return <Plane className={cls} />;
    case '/billing/preparation':
      return <ClipboardList className={cls} />;
    case '/billing/invoice-drafts':
      return <FileStack className={cls} />;
    case '/billing/review':
      return <CheckSquare className={cls} />;
    case '/billing/invoices':
      return <FileCheck className={cls} />;
    case '/billing/invoice-bin':
      return <Trash2 className={cls} />;
    case '/billing/equipment':
    case '/billing/equipment-master':
    case '/billing/cleaning':
      return <Wrench className={cls} />;
    case '/billing/manpower':
    case '/billing/maas':
      return <UsersRound className={cls} />;
    case '/billing/scheduled-flights':
    case '/billing/raf':
    case '/billing/xxld-scheduled':
    case '/billing/xxld-non-scheduled':
    case '/billing/non-scheduled':
      return <Plane className={cls} />;
    case '/billing/credit-memos':
      return <ScrollText className={cls} />;
    case '/billing/reports':
      return <BarChart3 className={cls} />;
    case '/billing/audit':
      return <Shield className={cls} />;
    case '/billing/cutover':
      return <GitBranch className={cls} />;
    case '/billing/parallel-run':
      return <CalendarRange className={cls} />;
    case '/billing/decommission':
      return <PowerOff className={cls} />;
    case '/billing/insights/marketing':
      return <Megaphone className={cls} />;
    case '/billing/insights/receivables':
      return <CircleDollarSign className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

function toBillingChromeDropdown(
  links: readonly { href: string; label: string }[],
) {
  return [...links]
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    .map((link) => ({
      label: link.label,
      path: link.href,
      icon: billingDropdownIcon(link.href),
    }));
}

// Department structure interface
interface Department {
  [key: string]: string; // e.g., { "operations": "ramp" }
}

interface NavItem {
  id: number;
  label: string;
  path: string;
  icon?: React.ReactNode;
  hasDropdown?: boolean;
  dropdownItems?: {
    label: string;
    path: string;
    permissionLabel?: string;
    icon?: React.ReactNode;
    hasNestedDropdown?: boolean;
    nestedItems?: {
      label: string;
      path: string;
      permissionLabel?: string;
      icon?: React.ReactNode;
    }[];
    departments?: string[]; // List of departments that can access this dropdown item
  }[];
  roles: ('employee' | 'manager' | 'superadmin')[];
  departments?: string[]; // List of departments that can access this nav item (for employees)
}

/** Billing chrome top tabs — filtered by admin page grants. */
function buildBillingChromeNavItems(): NavItem[] {
  const master = filterBillingNavLinks(BILLING_MASTER_NAV);
  const workflow = filterBillingNavLinks(BILLING_WORKFLOW_NAV);
  const sources = filterBillingNavLinks(BILLING_SOURCES_NAV);
  const others = filterBillingNavLinks(BILLING_OTHERS_NAV);
  const insights = filterBillingNavLinks(BILLING_INSIGHTS_NAV);
  const items: NavItem[] = [];
  if (mayUseBillingHref('/billing/dashboard')) {
    items.push({
      id: 900,
      label: 'Dashboard',
      path: '/billing/dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      roles: ['employee', 'manager', 'superadmin'],
    });
  }
  if (master.length > 0) {
    items.push({
      id: 901,
      label: 'Master',
      path: master[0]!.href,
      icon: <Database className="w-4 h-4" />,
      hasDropdown: true,
      roles: ['employee', 'manager', 'superadmin'],
      dropdownItems: toBillingChromeDropdown(master),
    });
  }
  if (workflow.length > 0) {
    items.push({
      id: 902,
      label: 'Workflow',
      path: workflow[0]!.href,
      icon: <ClipboardList className="w-4 h-4" />,
      hasDropdown: true,
      roles: ['employee', 'manager', 'superadmin'],
      dropdownItems: toBillingChromeDropdown(workflow),
    });
  }
  if (sources.length > 0) {
    items.push({
      id: 903,
      label: 'Billed Services',
      path: sources[0]!.href,
      icon: <Package className="w-4 h-4" />,
      hasDropdown: true,
      roles: ['employee', 'manager', 'superadmin'],
      dropdownItems: toBillingChromeDropdown(sources),
    });
  }
  if (insights.length > 0) {
    items.push({
      id: 905,
      label: 'Insights',
      path: insights[0]!.href,
      icon: <LineChart className="w-4 h-4" />,
      hasDropdown: true,
      roles: ['employee', 'manager', 'superadmin'],
      dropdownItems: toBillingChromeDropdown(insights),
    });
  }
  if (others.length > 0) {
    items.push({
      id: 904,
      label: 'Others',
      path: others[0]!.href,
      icon: <BarChart3 className="w-4 h-4" />,
      hasDropdown: true,
      roles: ['employee', 'manager', 'superadmin'],
      dropdownItems: toBillingChromeDropdown(others),
    });
  }
  return items;
}

// User interface for typed user data
interface UserData {
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'superadmin';
  avatarInitials?: string;
  department?: Department; // Department information for regular users
}

// Static nav config (single reference, no per-render allocation)
const ALL_NAV_ITEMS: NavItem[] = [
    {
      id: 1,
      label: 'Dashboard',
      path: '/fris/dashboard',
      icon: <Home className="w-4 h-4" />,
      roles: ['manager', 'superadmin'],
      hasDropdown: true,
      dropdownItems: [
        {
          label: 'Scheduled Flights',
          path: '/fris/dashboard',
          icon: <Calendar className="w-3 h-3" />,
        },
        {
          label: 'Non scheduled flights',
          path: '/fris/dashboard?flightScope=nonScheduled',
          icon: <Clock className="w-3 h-3" />,
        },
      ],
    },
    {
      id: 65,
      label: 'Creation',
      path: '/fris/creation',
      icon: <PlusCircle className="w-4 h-4" />,
      roles: ['superadmin'],
    },
    {
      id: 66,
      label: 'Advance',
      path: '/fris/advance',
      icon: <Sliders className="w-4 h-4" />,
      roles: ['superadmin'],
    },
    {
      id: 2,
      label: 'Flights',
      path: '/fris/flights/scheduledairlines',
      hasDropdown: true,
      icon: <Plane className="w-4 h-4" />,
      roles: ['employee', 'manager', 'superadmin'],
      departments: ['operations', 'ramp', 'pax', 'gsd', 'cargo', 'security', 'booking'],
      dropdownItems: [
        {
          label: 'Scheduled Airlines',
          path: '/fris/flights/scheduledairlines',
          icon: <Calendar className="w-3 h-3" />,
          hasNestedDropdown: true,
          nestedItems: [
            {
              label: 'Scheduled Data Export',
              path: '/fris/flights/scheduledairlines/data-export',
              icon: <Download className="w-3 h-3" />,
            },
            {
              label: 'Scheduled Cancellation History',
              path: '/fris/flights/cancellation-history',
              icon: <History className="w-3 h-3" />,
            },
          ],
        },
        {
          label: 'Non-Scheduled Airlines',
          path: '/fris/flights/Non-Scheduled-Airlines',
          icon: <Clock className="w-3 h-3" />,
          hasNestedDropdown: true,
          nestedItems: [
            {
              label: 'Non scheduled Booking',
              path: '/fris/flights/non-scheduled-airlines/non-scheduled-booking',
              icon: <BookOpen className="w-3 h-3" />,
            },
            {
              label: 'Booking Details',
              path: '/fris/flights/non-scheduled-airlines/booking-details',
              icon: <FileText className="w-3 h-3" />,
            },
            {
              label: 'Non Scheduled Data Export',
              path: '/fris/flights/non-scheduled-airlines/data-export',
              icon: <Download className="w-3 h-3" />,
            },
            {
              label: 'Non-Scheduled Cancellation History',
              path: '/fris/flights/non-scheduled-airlines/cancellation-history',
              icon: <History className="w-3 h-3" />,
            },
          ],
        },
        {
          label: 'Flight Schedule',
          path: '/fris/flights/flight-schedule',
          icon: <Calendar className="w-3 h-3" />,
        },
        {
          label: 'Peak Flights',
          path: '/fris/flights/peak-flights',
          icon: <TrendingUp className="w-3 h-3" />,
        },
        {
          label: 'Ramp Assistance Forms',
          path: '/fris/flights/ramp-assistance-forms',
          icon: <Shield className="w-3 h-3" />,
        },
      ],
    },
    {
      id: 3,
      label: 'Reports',
      path: '/fris/reports',
      hasDropdown: true,
      icon: <BarChart3 className="w-4 h-4" />,
      roles: ['employee', 'manager', 'superadmin'],
      departments: ['operations', 'ramp', 'pax', 'gsd', 'cargo', 'management'], // Operational departments can access reports
      dropdownItems: [
        {
          label: 'Pax Shift Report',
          path: '/fris/reports/pax-shift',
          icon: <Users className="w-3 h-3" />,
        },
        {
          label: 'Pax Shift Analysis Report',
          path: '/fris/reports/pax-shift-analysis',
          icon: <PieChart className="w-3 h-3" />,
        },
        {
          label: 'Ramp Shift Report',
          path: '/fris/reports/ramp-shift',
          icon: <Shield className="w-3 h-3" />,
        },
        {
          label: 'GSD Shift Report',
          path: '/fris/reports/gsd-shift',
          icon: <FileText className="w-3 h-3" />,
        },
        {
          label: 'Quality Report',
          path: '/fris/reports/quality',
          icon: <AlertCircle className="w-3 h-3" />,
        },
        {
          label: 'Missing FHR Report',
          path: '/fris/reports/missing-fhr',
          icon: <AlertCircle className="w-3 h-3" />,
        },
        {
          label: 'Delay Report',
          path: '/fris/reports/delay',
          icon: <Clock className="w-3 h-3" />,
        },
        {
          label: 'Cleaning Services',
          path: '/fris/reports/cleaning-services',
          icon: <Sparkles className="w-3 h-3" />,
        },
        {
          label: 'Consolidated Report',
          path: '/fris/reports/consolidated',
          icon: <Database className="w-3 h-3" />,
          hasNestedDropdown: true,
          nestedItems: [
            {
              label: 'Scheduled FHR, GSE & Team Report',
              path: '/fris/reports/consolidated/scheduled-fhr',
              icon: <FileText className="w-3 h-3" />,
            },
            {
              label: 'Non Scheduled FHR, GSE & Team Report',
              path: '/fris/reports/consolidated/non-scheduled-fhr',
              icon: <FileText className="w-3 h-3" />,
            },
          ],
        },
      ],
    },
    {
      id: 5,
      label: 'MIS',
      path: MIS_DEFAULT_PATH,
      hasDropdown: true,
      icon: <LineChart className="w-4 h-4" />,
      roles: ['employee', 'manager', 'superadmin'],
      departments: ['operations', 'ramp', 'pax', 'gsd', 'cargo', 'management'],
      dropdownItems: [
        {
          label: MIS_STATION_WISE_NAV_LABEL,
          path: '/fris/mis/station-wise',
          permissionLabel: 'MIS Station Wise',
          icon: <Calendar className="w-3 h-3" />,
          hasNestedDropdown: true,
          nestedItems: MIS_PAGES.filter((page) => page.navGroup === 'station-wise').map(
            (page) => ({
              label: page.label,
              path: page.path,
              permissionLabel: misPagePermissionLabel(page),
              icon: <FileSpreadsheet className="w-3 h-3" />,
            }),
          ),
        },
        {
          label: MIS_AIRLINE_WISE_NAV_LABEL,
          path: '/fris/mis/airline-wise',
          permissionLabel: 'MIS Airline Wise',
          icon: <Plane className="w-3 h-3" />,
          hasNestedDropdown: true,
          nestedItems: MIS_PAGES.filter((page) => page.navGroup === 'airline-wise').map(
            (page) => ({
              label: page.label,
              path: page.path,
              permissionLabel: misPagePermissionLabel(page),
              icon: <Plane className="w-3 h-3" />,
            }),
          ),
        },
        {
          label: MIS_MONTH_WISE_NAV_LABEL,
          path: '/fris/mis/month-wise',
          permissionLabel: 'MIS Month Wise',
          icon: <Calendar className="w-3 h-3" />,
          hasNestedDropdown: true,
          nestedItems: MIS_PAGES.filter((page) => page.navGroup === 'month-wise').map(
            (page) => ({
              label: page.label,
              path: page.path,
              permissionLabel: misPagePermissionLabel(page),
              icon: <FileSpreadsheet className="w-3 h-3" />,
            }),
          ),
        },
        ...MIS_PAGES.filter((page) => !page.navGroup).map((page) => ({
          label: page.label,
          path: page.path,
          permissionLabel: misPagePermissionLabel(page),
          icon:
            page.slug === 'remarks' ? (
              <MessageSquare className="w-3 h-3" />
            ) : page.slug === 'raf' ? (
              <Shield className="w-3 h-3" />
            ) : page.slug === 'bhs' ? (
              <FileSpreadsheet className="w-3 h-3" />
            ) : page.slug === 'mis-checker' ? (
              <FileCheck className="w-3 h-3" />
            ) : (
              <Radio className="w-3 h-3" />
            ),
        })),
      ],
    },
  ];

const REPORTS_NAV_ITEM_ID = 3;
const BILLING_CHROME_NAV_IDS = new Set([901, 902, 903, 904, 905]);

function getDesktopDropdownWrapperClass(): string {
  return 'absolute top-full left-1/2 z-[101] w-max max-w-[min(100vw-2rem,32rem)] -translate-x-1/2 pt-1';
}

type FlatDropdownRow = {
  label: string;
  path: string;
  icon?: React.ReactNode;
  indent?: boolean;
  /** Non-navigable group label (e.g. "Consolidated Report"); only its children link out. */
  isHeader?: boolean;
};

/** Reports menu: single flat list (Consolidated + nested links always visible, no accordion). */
function flattenReportsDropdownItems(
  items: NonNullable<NavItem['dropdownItems']>,
): FlatDropdownRow[] {
  const rows: FlatDropdownRow[] = [];
  for (const entry of items) {
    const hasNested = !!entry.nestedItems?.length;
    rows.push({
      label: entry.label,
      path: entry.path,
      icon: entry.icon,
      isHeader: hasNested,
    });
    if (hasNested) {
      for (const nested of entry.nestedItems!) {
        rows.push({
          label: nested.label,
          path: nested.path,
          icon: nested.icon,
          indent: true,
        });
      }
    }
  }
  return rows;
}

const HIDDEN_SCROLLBAR_CLASS = FRIS_HIDDEN_SCROLLBAR_CLASS;

/** Scrollable mobile nav panel — fits below fixed h-12 navbar. */
const MOBILE_MENU_OPEN_CLASS = `max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-y-contain touch-pan-y ${HIDDEN_SCROLLBAR_CLASS}`;

const MOBILE_DROPDOWN_SCROLL_CLASS = `overflow-y-auto overscroll-y-contain touch-pan-y ${HIDDEN_SCROLLBAR_CLASS}`;

function getDesktopDropdownPanelClass(navItemId: number): string {
  const base =
    'min-w-[280px] rounded-xl border border-gray-100 bg-white shadow-xl';
  if (navItemId === REPORTS_NAV_ITEM_ID || BILLING_CHROME_NAV_IDS.has(navItemId)) {
    return `${base} max-h-[min(92dvh,44rem)] overflow-y-auto overscroll-y-contain ${HIDDEN_SCROLLBAR_CLASS}`;
  }
  return `${base} max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-y-contain ${HIDDEN_SCROLLBAR_CLASS}`;
}

function getMobileDropdownPanelMaxClass(navItemId: number, isOpen: boolean): string {
  if (!isOpen) return 'max-h-0 pointer-events-none overflow-hidden';
  if (navItemId === REPORTS_NAV_ITEM_ID || BILLING_CHROME_NAV_IDS.has(navItemId)) {
    return `max-h-[min(50dvh,20rem)] ${MOBILE_DROPDOWN_SCROLL_CLASS}`;
  }
  return `max-h-[min(45dvh,18rem)] ${MOBILE_DROPDOWN_SCROLL_CLASS}`;
}

const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [activeNestedDropdown, setActiveNestedDropdown] = useState<
    string | null
  >(null);
  const [user, setUser] = useState<UserData | null>(null);
  const userNavFlags = useFrisNavFlags();
  const [raiseTicketOpen, setRaiseTicketOpen] = useState(false);
  const [changeStationOpen, setChangeStationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathIsBillingApp =
    Boolean(pathname?.startsWith('/billing')) &&
    !Boolean(pathname?.startsWith('/billing/login'));
  /** Cross-nav FRIS tabs keep billing skin via localStorage entry flag. */
  const [billingEntryChrome, setBillingEntryChrome] = useState(false);
  // Pathname is enough on /billing/*; LS flag covers Advance/Flights/MIS after billing login.
  const billingNavbarChrome = pathIsBillingApp || billingEntryChrome;

  // Sync pathname as active path (no separate state; pathname is source of truth)
  const activePath = pathname ?? '/fris/flights/scheduledairlines';

  // Billing chrome also depends on localStorage entry flag (Advance/Flights/MIS after billing login).
  useEffect(() => {
    setBillingEntryChrome(isBillingNavbarChrome(pathname) && !pathIsBillingApp);
  }, [pathname, pathIsBillingApp]);

  // User from localStorage once on mount (client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('userName');
    const isAuthenticated = localStorage.getItem('isAuthenticated');
    
    // Check for role (manager/superadmin) OR department (regular user)
    const userRoleRaw = localStorage.getItem('userRole');
    const userRole = userRoleRaw
      ? normalizeFrisUserRole(userRoleRaw)
      : null;
    const userDepartmentStr = localStorage.getItem('userDepartment');

    // User is authenticated if they have either a role OR a department
    if (isAuthenticated === 'true' && userId) {
      let finalRole: 'employee' | 'manager' | 'superadmin';
      let department: Department | undefined;
      
      if (userRole) {
        // Manager or SuperAdmin - has explicit role, no department filtering
        finalRole = userRole;
        console.log('Manager/SuperAdmin identified:', { userId, role: userRole });
      } else if (userDepartmentStr) {
        // Regular user - has department, assign 'employee' role
        finalRole = 'employee';
        
        try {
          // Parse department JSON from localStorage
          department = JSON.parse(userDepartmentStr) as Department;
          console.log('User identified with department:', department);
        } catch (error) {
          console.error('Failed to parse user department:', error);
          setUser(null);
          return;
        }
      } else {
        // No role or department - cannot identify user
        console.warn('User has no role or department in localStorage');
        setUser(null);
        return;
      }

      setUser({
        name: userName || userId,
        email: `${userId}`,
        role: finalRole,
        department: department, // Include department for filtering
        avatarInitials: (userName || userId).substring(0, 2).toUpperCase(),
      });
      
      console.log('User authenticated:', { 
        userId, 
        role: finalRole, 
        department: department ? Object.keys(department) : 'none' 
      });
    } else {
      setUser(null);
    }
  }, []);

  // Helper function to check if user has department access to a nav item
  const hasDepartmentAccess = useCallback((item: NavItem): boolean => {
    // Admins and SuperAdmins have access to everything
    if (user?.role === 'manager' || user?.role === 'superadmin') {
      return true;
    }
    
    // If no department restrictions specified, allow access
    if (!item.departments || item.departments.length === 0) {
      return true;
    }
    
    // For employees, check if their department matches any allowed department
    if (user?.role === 'employee' && user.department) {
      // Check if any of the user's department keys match allowed departments
      const userDepartmentKeys = Object.keys(user.department);
      const userDepartmentValues = Object.values(user.department);
      
      // Check both department keys (e.g., "operations") and values (e.g., "ramp")
      return item.departments.some(allowedDept => 
        userDepartmentKeys.includes(allowedDept) || 
        userDepartmentValues.includes(allowedDept)
      );
    }
    
    // Default: no access
    return false;
  }, [user]);

  // Panel users with admin-assigned flags use permission-based nav.
  // Superadmins always get the full navbar (new pages included by default).
  // Billing chrome: Dashboard + Master / Workflow / Billed Services / Insights / Others + Advance / Flights / MIS.
  const navItems = useMemo(() => {
    if (!user) return [];

    const isSuperadmin = normalizeFrisUserRole(user.role) === 'superadmin';
    const useFlagNav =
      !isSuperadmin &&
      userNavFlags != null &&
      Object.keys(userNavFlags).length > 0;

    let items: NavItem[];
    if (useFlagNav) {
      // Created/panel users get the SAME navbar structure as superadmin
      // (top-level tabs as links/dropdowns), only filtered down to the
      // pages they are permitted to see. Unassigned tabs/sub-pages are hidden.
      items = ALL_NAV_ITEMS.map((item) =>
        filterNavItemByFlags(item, userNavFlags!),
      ).filter((item): item is NavItem => item != null);
    } else {
      items = ALL_NAV_ITEMS.filter((item) => {
        const hasRoleAccess = item.roles.includes(user.role) || isSuperadmin;
        if (!hasRoleAccess) return false;
        return hasDepartmentAccess(item);
      });
    }

    if (billingNavbarChrome) {
      const loginStation =
        typeof window === 'undefined'
          ? ''
          : String(
              getStoredLoginStationContext().stationCode ||
                localStorage.getItem('userStationCode') ||
                '',
            )
              .trim()
              .toUpperCase();
      const scheduledAirlines = billingFrisHref(
        DEPLOYED_SCHEDULED_AIRLINES_PATH,
        loginStation,
      );
      const openScheduledAirlines = (label: 'Advance' | 'Flights'): NavItem => {
        const source = ALL_NAV_ITEMS.find((item) => item.label === label)!;
        return {
          ...source,
          path: scheduledAirlines,
          hasDropdown: false,
          dropdownItems: undefined,
        };
      };
      const mis = items.filter((item) => item.label === 'MIS');
      const byLabel = (a: { label: string }, b: { label: string }) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
      return [
        ...buildBillingChromeNavItems(),
        openScheduledAirlines('Advance'),
        openScheduledAirlines('Flights'),
        ...mis,
      ].map((item) =>
        item.dropdownItems
          ? {
              ...item,
              dropdownItems: [...item.dropdownItems].sort(byLabel).map((entry) =>
                entry.nestedItems
                  ? { ...entry, nestedItems: [...entry.nestedItems].sort(byLabel) }
                  : entry,
              ),
            }
          : item,
      );
    }

    return items;
  }, [user, userNavFlags, hasDepartmentAccess, billingNavbarChrome]);

  const ticketNavSections = useMemo(
    () =>
      buildTicketNavSections(
        navItems.map((item) => ({
          label: item.label,
          path: item.path,
          hasDropdown: item.hasDropdown,
          dropdownItems: item.dropdownItems?.map((d) => ({
            label: d.label,
            path: d.path,
            nestedItems: d.nestedItems?.map((n) => ({ label: n.label, path: n.path })),
          })),
        }))
      ),
    [navItems]
  );

  const handleLogout = useCallback(async () => {
    setActiveDropdown(null);
    setIsOpen(false);
    const returnToBillingLogin = billingNavbarChrome;
    await logoutFrisToStationMap();
    window.location.replace(returnToBillingLogin ? '/billing/login' : '/?skipIntro=1');
  }, [billingNavbarChrome]);

  // Close menus on navigation. Tab highlight uses isNavItemActive — do not
  // re-open the panel just because the route matches a dropdown child.
  useEffect(() => {
    setActiveDropdown(null);
    setActiveNestedDropdown(null);
  }, [activePath, searchParams]);

  const isActive = useCallback(
    (path: string) => {
      if (path.includes('flightScope=') || path === DASHBOARD_PATH) {
        return isDashboardFlightScopeHrefActive(path, activePath, searchParams);
      }
      if (activePath === path) return true;
      if (
        path === '/billing/customers' &&
        (activePath === '/billing/service-catalog' ||
          activePath.startsWith('/billing/service-catalog/'))
      ) {
        return true;
      }
      // Billing child routes keep parent dropdown item highlighted.
      if (path.startsWith('/billing/') && activePath.startsWith(`${path}/`)) {
        return true;
      }
      return false;
    },
    [activePath, searchParams],
  );

  const isNavItemActive = useCallback(
    (item: NavItem) => {
      if (item.path === DASHBOARD_PATH && activePath === DASHBOARD_PATH) {
        return true;
      }
      if (isActive(item.path)) return true;
      if (!item.dropdownItems) return false;
      for (const d of item.dropdownItems) {
        if (isActive(d.path)) return true;
        if (d.nestedItems?.some((n) => isActive(n.path))) return true;
      }
      return false;
    },
    [activePath, isActive],
  );

  const isDropdownItemActive = useCallback(
    (dropdownItem: { path: string; nestedItems?: { path: string }[] }) => {
      if (isActive(dropdownItem.path)) return true;
      return dropdownItem.nestedItems?.some((n) => isActive(n.path)) ?? false;
    },
    [isActive],
  );

  // Throttled scroll (one update per frame)
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 20);
        ticking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdowns when clicking outside (use mousedown so it doesn't fire in same gesture as the open click)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setActiveDropdown(null);
        setActiveNestedDropdown(null);
      }
    };

    if (activeDropdown !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeDropdown]);

  const toggleDropdown = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const opening = activeDropdown !== id;
    setActiveDropdown(opening ? id : null);
    if (!opening) {
      setActiveNestedDropdown(null);
    } else if (id === 5) {
      setActiveNestedDropdown(misNestedNavLabelForPath(pathname));
    } else if (id === 999 || id === 9999) {
      // Re-read login station when opening profile (storage may update after mount).
      setStationDisplayName(resolveStationDisplayName());
    }
  };

  const toggleNestedDropdown = (e: React.MouseEvent, label: string) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveNestedDropdown(activeNestedDropdown === label ? null : label);
  };

  const getRoleColor = (role: string) => {
    if (billingNavbarChrome) {
      switch (role) {
        case 'superadmin':
          return 'from-[#1C0770] to-[#3A9AFF]';
        case 'manager':
          return 'from-[#261CC1] to-[#1C0770]';
        case 'employee':
          return 'from-[#261CC1] to-[#3A9AFF]';
        default:
          return 'from-[#1C0770] to-[#261CC1]';
      }
    }
    switch (role) {
      case 'superadmin':
        return 'from-emerald-500 to-green-500';
      case 'manager':
        return 'from-purple-500 to-pink-500';
      case 'employee':
        return 'from-emerald-500 to-cyan-400';
      default:
        return 'from-emerald-500 to-cyan-400';
    }
  };

  const getRoleBadgeColor = (role: string) => {
    if (billingNavbarChrome) {
      switch (role) {
        case 'superadmin':
          return 'bg-[#1C0770]/15 text-[#1C0770] border-[#1C0770]/25';
        case 'manager':
          return 'bg-[#261CC1]/15 text-[#261CC1] border-[#261CC1]/25';
        case 'employee':
          return 'bg-[#3A9AFF]/20 text-[#1C0770] border-[#3A9AFF]/30';
        default:
          return 'bg-gray-500/20 text-gray-600 border-gray-500/30';
      }
    }
    switch (role) {
      case 'superadmin':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'manager':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'employee':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'Super Admin';
      case 'manager':
        return 'Manager';
      case 'employee':
        return 'Employee';
      default:
        return 'User';
    }
  };

  const resolveStationDisplayName = useCallback(() => {
    if (typeof window === 'undefined') return '—';
    const ctx = getStoredLoginStationContext();
    const code =
      String(ctx.stationCode ?? '').trim().toUpperCase() ||
      localStorage.getItem('userStationCode')?.trim().toUpperCase() ||
      '';
    // Heal stale city↔code pairs left from older session writes.
    if (code) persistLoginStationContext({ stationCode: code });
    return formatLoginStationDisplay({
      stationCode: code || ctx.stationCode,
      city: localStorage.getItem('userStationCity'),
    });
  }, []);

  const [stationDisplayName, setStationDisplayName] = useState('—');
  const [sessionStationCode, setSessionStationCode] = useState('');

  useEffect(() => {
    const refresh = () => {
      setStationDisplayName(resolveStationDisplayName());
      const ctx = getStoredLoginStationContext();
      setSessionStationCode(
        String(ctx.stationCode ?? '').trim().toUpperCase() ||
          localStorage.getItem('userStationCode')?.trim().toUpperCase() ||
          '',
      );
    };
    refresh();
    window.addEventListener(FRIS_SESSION_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    // Catch late writes after soft navigation / session validate.
    const t = window.setTimeout(refresh, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(FRIS_SESSION_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [resolveStationDisplayName]);

  const canChangeStation =
    normalizeFrisUserRole(user?.role) === 'superadmin' &&
    (Boolean(pathname?.startsWith('/fris')) ||
      Boolean(pathname?.startsWith('/billing')));

  /** Scrollable nav panels: wheel/touch works; native scrollbar chrome hidden (see BirdFlightDelhiDashboard). */

  /** Billing-only Color Hunt chrome — FRIS/Admin keep emerald/yellow when flag false.
   * Light Tailwind fills remain for billing-entry chrome on FRIS pages;
   * `.billing-app nav.billing-nav-chrome` CSS remaps the same helper classes for dark shell. */
  const navSkin = billingNavbarChrome
    ? {
        focusRing: 'focus:ring-2 focus:ring-[#3A9AFF]/50',
        focusVisibleRing: 'focus-visible:ring-2 focus-visible:ring-[#3A9AFF]/45',
        itemActive:
          'billing-nav-item-active bg-[#ebe6f7] text-[#1C0770] hover:bg-[#ebe8fc] hover:text-[#150558]',
        itemIdle:
          'billing-nav-item-idle text-gray-700 hover:text-[#261CC1] hover:bg-[#ebe6f7]',
        iconActive: 'billing-nav-icon-active text-[#1C0770]',
        iconIdle: 'billing-nav-icon-idle text-gray-500 group-hover:text-[#261CC1]',
        activeBar: 'billing-nav-active-bar bg-[#F1FF5E]',
        linkHover: 'billing-nav-soft-hover hover:text-[#261CC1] hover:bg-[#ebe6f7]',
        linkFocus: 'billing-nav-soft-focus focus:bg-[#ebe6f7]',
        linkFocusVisible: 'billing-nav-soft-focus focus-visible:bg-[#ebe6f7]',
        linkActive: 'billing-nav-link-active bg-[#ebe6f7] text-[#1C0770]',
        linkActiveIcon: 'billing-nav-link-active-icon text-[#1C0770]',
        linkHoverIcon: 'billing-nav-link-hover-icon text-gray-400 group-hover/item:text-[#261CC1]',
        nestedOpen: 'billing-nav-nested-open bg-[#ebe6f7] text-[#1C0770]',
        nestedOpenIcon: 'billing-nav-nested-open-icon text-[#261CC1]',
        avatarOpen: 'billing-nav-avatar-open border-[#9dcbff] bg-[#e8f3ff]/70 shadow-sm',
        avatarChevronOpen: 'billing-nav-avatar-chevron text-[#1C0770]',
        profileHeader: 'billing-nav-profile-header from-[#ebe6f7] to-[#e8f3ff]',
        mobileRoleBg: 'billing-nav-mobile-role bg-[#ebe6f7]',
        mobileItemActive: 'billing-nav-link-active bg-[#ebe6f7] text-[#1C0770]',
        mobileItemIdle: 'billing-nav-item-idle text-gray-700 hover:text-[#261CC1]',
        softHover: 'billing-nav-soft-hover hover:bg-[#ebe6f7]',
        hamburgerHover: 'billing-nav-item-idle text-gray-700 hover:text-[#261CC1]',
        dropdownPanelExtra:
          'billing-nav-dropdown border-[#b5aee0] shadow-[0_12px_28px_-10px_rgba(28,7,112,0.16)]',
        fallbackGrad: 'from-[#1C0770] to-[#261CC1]',
      }
    : {
        focusRing: 'focus:ring-2 focus:ring-emerald-300/50',
        focusVisibleRing: 'focus-visible:ring-2 focus-visible:ring-emerald-400/45',
        itemActive:
          'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800',
        itemIdle: 'text-gray-700 hover:text-emerald-600 hover:bg-gray-100',
        iconActive: 'text-emerald-600',
        iconIdle: 'text-gray-500 group-hover:text-emerald-500',
        activeBar: 'bg-emerald-400',
        linkHover: 'hover:text-emerald-600 hover:bg-emerald-50',
        linkFocus: 'focus:bg-emerald-50',
        linkFocusVisible: 'focus-visible:bg-emerald-50',
        linkActive: 'bg-yellow-50 text-yellow-700',
        linkActiveIcon: 'text-yellow-600',
        linkHoverIcon: 'text-gray-400 group-hover/item:text-emerald-500',
        nestedOpen: 'bg-emerald-50 text-emerald-700',
        nestedOpenIcon: 'text-emerald-600',
        avatarOpen: 'border-emerald-300 bg-emerald-50/70 shadow-sm',
        avatarChevronOpen: 'text-emerald-600',
        profileHeader: 'from-emerald-50 to-purple-50',
        mobileRoleBg: 'bg-emerald-50',
        mobileItemActive: 'bg-yellow-100 text-yellow-700',
        mobileItemIdle: 'text-gray-700 hover:text-emerald-600',
        softHover: 'hover:bg-emerald-50',
        hamburgerHover: 'text-gray-700 hover:text-emerald-600',
        dropdownPanelExtra: '',
        fallbackGrad: 'from-emerald-500 to-purple-500',
      };

  return (
    <nav
      className={`
      fixed top-0 left-0 w-full z-[100] 
      transition-all duration-300 ease-in-out
      ${billingNavbarChrome ? 'billing-nav-chrome' : ''}
      ${billingNavbarChrome ? 'h-[3.3rem]' : 'h-12'}
      ${scrolled ? 'bg-white/95 backdrop-blur-lg shadow-lg' : 'bg-white shadow-md'}
    `}
    >
      <div className="flex items-center justify-between h-full px-4 md:px-6">
        {/* Left side - Logo — .billing-logo-plate + inline #fff (nav often outside .billing-app) */}
        <div className="flex min-w-0 shrink-0 items-center h-full">
          <div
            className={
              billingNavbarChrome
                ? 'billing-logo-plate relative flex shrink-0 items-center rounded-md px-2 py-0.5 !bg-[#ffffff]'
                : 'relative flex h-full shrink-0 items-center'
            }
            style={
              billingNavbarChrome
                ? { backgroundColor: '#ffffff' }
                : undefined
            }
          >
            <StationCompanyLogo
              className="h-12 w-auto max-w-[34vw] sm:max-w-none"
              alt="Company logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = document.createElement('div');
                fallback.className =
                  'h-full flex items-center justify-center bg-gradient-to-br from-yellow-400 to-orange-500 px-4 rounded-lg';
                fallback.innerHTML =
                  '<span class="text-white font-bold text-xl">BG</span>';
                e.currentTarget.parentElement?.appendChild(fallback);
              }}
            />
          </div>
        </div>

        {billingNavbarChrome && sessionStationCode ? (
          <div className="flex shrink-0 items-center px-3">
            <span className="billing-nav-station billing-nav-station-chip whitespace-nowrap">
              <span className="billing-nav-station-kicker">Station</span>
              {sessionStationCode}
            </span>
          </div>
        ) : null}

        {billingNavbarChrome && sessionStationCode ? (
          <div className="hidden nav-desktop:block min-w-0 flex-1" aria-hidden />
        ) : null}

        {/* Navigation links - Desktop - Moved to center */}
        <div
          className={`hidden nav-desktop:flex min-w-0 items-center justify-center ${
            billingNavbarChrome
              ? 'billing-nav-track shrink-0 px-0'
              : 'flex-1 px-4 lg:px-10'
          }`}
        >
          {navItems.map((item) => (
            <div
              key={item.id}
              className="dropdown-container relative"
              onMouseEnter={() => {
                if (item.hasDropdown) {
                  if (activeDropdown !== item.id) {
                    setActiveNestedDropdown(
                      item.id === 5 ? misNestedNavLabelForPath(pathname) : null,
                    );
                  }
                  setActiveDropdown(item.id);
                  if (item.id === 5) {
                    setActiveNestedDropdown(misNestedNavLabelForPath(pathname));
                  }
                }
              }}
              onMouseLeave={() => {
                if (item.hasDropdown) {
                  setActiveDropdown(null);
                  setActiveNestedDropdown(null);
                }
              }}
            >
              <div className="relative">
                {item.hasDropdown ? (
                  <button
                    type="button"
                    className={`
                    flex items-center space-x-1.5 lg:space-x-2
                    px-3 lg:px-4 py-2 rounded-lg
                    font-medium text-sm lg:text-base
                    transition-all duration-200
                    group
                    focus:outline-none ${navSkin.focusRing}
                    ${
                      isNavItemActive(item) ||
                      (item.hasDropdown && activeDropdown === item.id)
                        ? navSkin.itemActive
                        : navSkin.itemIdle
                    }
                  `}
                    onClick={(e) => toggleDropdown(e, item.id)}
                  >
                  {item.icon && (
                    <span
                      className={
                        isNavItemActive(item) ||
                        (item.hasDropdown && activeDropdown === item.id)
                          ? navSkin.iconActive
                          : navSkin.iconIdle
                      }
                    >
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                  {item.hasDropdown && (
                    <ChevronDown
                      className={`
                        w-4 h-4 transition-transform duration-200
                        ${activeDropdown === item.id ? 'rotate-180' : ''}
                        ${
                          isNavItemActive(item) || activeDropdown === item.id
                            ? navSkin.iconActive
                            : navSkin.iconIdle
                        }
                      `}
                    />
                  )}
                </button>
                ) : (
                  <AppNavLink
                    href={item.path}
                    className={`
                    flex items-center space-x-1.5 lg:space-x-2
                    px-3 lg:px-4 py-2 rounded-lg
                    font-medium text-sm lg:text-base
                    transition-all duration-200
                    group
                    focus:outline-none ${navSkin.focusRing}
                    ${isNavItemActive(item) ? navSkin.itemActive : navSkin.itemIdle}
                  `}
                  >
                    {item.icon && (
                      <span className={isNavItemActive(item) ? navSkin.iconActive : navSkin.iconIdle}>
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </AppNavLink>
                )}

                {/* Active indicator */}
                {isNavItemActive(item) && (
                  <div
                    className={`
                    absolute bottom-0 left-1/2 transform -translate-x-1/2
                    h-1 w-3/4 ${navSkin.activeBar}
                    rounded-t-full
                  `}
                  ></div>
                )}
              </div>

              {/* Dropdown menu - only in DOM when open so it never captures clicks when closed */}
              {item.hasDropdown && item.dropdownItems && activeDropdown === item.id && (
                <div className={getDesktopDropdownWrapperClass()}>
                {/* Invisible bridge so moving from nav button to panel does not close the menu */}
                <div className="h-1" aria-hidden />
                <div
                  className={`${getDesktopDropdownPanelClass(item.id)} ${navSkin.dropdownPanelExtra}`}
                  role="menu"
                >
                  {item.id === REPORTS_NAV_ITEM_ID ||
                  BILLING_CHROME_NAV_IDS.has(item.id) ? (
                    flattenReportsDropdownItems(item.dropdownItems).map(
                      (row, index) =>
                        row.isHeader ? (
                          <div
                            key={`${row.path}-${index}`}
                            className="flex items-center space-x-2 border-b border-gray-50 bg-gray-50/70 px-4 py-2.5 cursor-default select-none"
                          >
                            {row.icon && (
                              <span className="text-gray-400">{row.icon}</span>
                            )}
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {row.label}
                            </span>
                          </div>
                        ) : (
                        <AppNavLink
                          key={`${row.path}-${index}`}
                          href={row.path}
                          className={`
                            flex items-center space-x-2 px-4 py-3
                            ${navSkin.linkHover}
                            border-b border-gray-50 last:border-b-0
                            transition-all duration-150 group/item w-full
                            focus:outline-none ${navSkin.linkFocus}
                            ${row.indent ? 'pl-10 bg-gray-50/50' : ''}
                            ${isActive(row.path) ? navSkin.linkActive : 'text-gray-700'}
                          `}
                          onClick={() => {
                            setActiveDropdown(null);
                            setActiveNestedDropdown(null);
                          }}
                        >
                          {row.icon && (
                            <span
                              className={
                                isActive(row.path)
                                  ? navSkin.linkActiveIcon
                                  : navSkin.linkHoverIcon
                              }
                            >
                              {row.icon}
                            </span>
                          )}
                          <span className="text-sm font-medium">{row.label}</span>
                        </AppNavLink>
                      ),
                    )
                  ) : (
                  item.dropdownItems.map((dropdownItem, index) => {
                    const nestedOpen =
                      dropdownItem.hasNestedDropdown &&
                      activeNestedDropdown === dropdownItem.label;

                    return (
                      <div
                        key={index}
                        className="border-b border-gray-50 last:border-b-0"
                        onMouseEnter={() => {
                          if (dropdownItem.hasNestedDropdown) {
                            setActiveNestedDropdown(dropdownItem.label);
                          }
                          // Do not clear nested state on flat items — collapsing accordions
                          // shrinks the panel and fires mouseleave on the nav container.
                        }}
                      >
                        <div className="flex items-stretch">
                          <AppNavLink
                            href={dropdownItem.path}
                            className={`
                              flex flex-1 items-center gap-2 px-4 py-3
                              transition-all duration-150 group/item
                              ${navSkin.linkHover}
                              focus:outline-none ${navSkin.linkFocus}
                              ${isDropdownItemActive(dropdownItem) ? navSkin.linkActive : 'text-gray-700'}
                              ${nestedOpen ? navSkin.nestedOpen : ''}
                            `}
                            onClick={() => {
                              if (!dropdownItem.hasNestedDropdown) {
                                setActiveDropdown(null);
                                setActiveNestedDropdown(null);
                              }
                            }}
                          >
                            {dropdownItem.icon && (
                              <span
                                className={
                                  isDropdownItemActive(dropdownItem)
                                    ? navSkin.linkActiveIcon
                                    : navSkin.linkHoverIcon
                                }
                              >
                                {dropdownItem.icon}
                              </span>
                            )}
                            <span className="flex-1 text-sm font-medium">
                              {dropdownItem.label}
                            </span>
                          </AppNavLink>
                          {dropdownItem.hasNestedDropdown && (
                            <button
                              type="button"
                              className={`
                                flex shrink-0 items-center justify-center px-3
                                transition-colors duration-150
                                ${navSkin.softHover} focus:outline-none ${navSkin.linkFocus}
                                ${nestedOpen ? `${navSkin.nestedOpen}` : 'text-gray-400'}
                              `}
                              aria-expanded={nestedOpen}
                              aria-label={`${nestedOpen ? 'Collapse' : 'Expand'} ${dropdownItem.label} submenu`}
                              onClick={(e) => toggleNestedDropdown(e, dropdownItem.label)}
                            >
                              <ChevronDown
                                className={`
                                  h-4 w-4 transition-transform duration-200
                                  ${nestedOpen ? 'rotate-180' : ''}
                                `}
                                aria-hidden
                              />
                            </button>
                          )}
                        </div>

                        {dropdownItem.hasNestedDropdown && dropdownItem.nestedItems && (
                          <div
                            className={`
                              overflow-hidden transition-[max-height] duration-200 ease-out
                              ${nestedOpen ? 'max-h-64' : 'max-h-0 pointer-events-none'}
                            `}
                            role="menu"
                          >
                            <div className="border-t border-gray-100 bg-gray-50/80 py-1">
                              {dropdownItem.nestedItems.map(
                                (nestedItem, nestedIndex) => (
                                  <AppNavLink
                                    key={nestedIndex}
                                    href={nestedItem.path}
                                    className={`
                                      flex items-center gap-2 py-2.5 pl-10 pr-4 text-sm
                                      transition-all duration-150 group/nested
                                      ${navSkin.linkHover}
                                      focus:outline-none ${navSkin.linkFocus}
                                      ${isActive(nestedItem.path) ? navSkin.linkActive : 'text-gray-600'}
                                    `}
                                    onClick={() => {
                                      setActiveDropdown(null);
                                      setActiveNestedDropdown(null);
                                    }}
                                  >
                                    {nestedItem.icon && (
                                      <span
                                        className={
                                          isActive(nestedItem.path)
                                            ? navSkin.linkActiveIcon
                                            : billingNavbarChrome
                                              ? 'text-gray-400 group-hover/nested:text-[#261CC1]'
                                              : 'text-gray-400 group-hover/nested:text-emerald-500'
                                        }
                                      >
                                        {nestedItem.icon}
                                      </span>
                                    )}
                                    <span className="font-medium">
                                      {nestedItem.label}
                                    </span>
                                  </AppNavLink>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right side - User Profile */}
        <div className="flex items-center space-x-3">
          {billingNavbarChrome ? <BillingNightToggle /> : null}
          {/* Hamburger menu for mobile */}
          <button
            className={`
              nav-desktop:hidden p-2 rounded-lg
              ${navSkin.hamburgerHover}
              hover:bg-gray-100
              transition-colors duration-200
              focus:outline-none ${navSkin.focusRing}
            `}
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle navigation menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* User Profile Dropdown - Desktop */}
          <div className="hidden nav-desktop:block relative dropdown-container">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={activeDropdown === 999}
              className={`
                group box-border flex h-9 max-h-9 shrink-0 items-center gap-2 rounded-full
                border-2 px-2.5 transition-[background-color,border-color,box-shadow] duration-200
                ${billingNavbarChrome ? 'billing-nav-avatar' : ''}
                focus-visible:outline-none ${navSkin.focusVisibleRing}
                focus-visible:ring-offset-2 focus-visible:ring-offset-white
                ${
                  activeDropdown === 999
                    ? navSkin.avatarOpen
                    : 'border-transparent bg-gray-50/90 hover:bg-gray-100'
                }
              `}
              onClick={(e) => toggleDropdown(e, 999)}
            >
              {/* Profile Avatar with role-based gradient — fits h-12 navbar without clipping */}
              <div
                className={`
                  flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                  bg-gradient-to-br ${user ? getRoleColor(user.role) : navSkin.fallbackGrad}
                  text-[11px] font-semibold text-white
                  border border-white/95 shadow-sm
                  transition-transform duration-200
                  group-hover:scale-[1.03]
                `}
              >
                {user?.avatarInitials || <User className="h-4 w-4" />}
              </div>

              <ChevronDown
                className={`
                  h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200
                  ${activeDropdown === 999 ? `rotate-180 ${navSkin.avatarChevronOpen}` : 'group-hover:text-gray-700'}
                `}
              />
            </button>

            {/* Profile Dropdown Menu - only in DOM when open so it can never capture clicks when closed */}
            {activeDropdown === 999 && (
            <div
              className="billing-profile-menu absolute right-0 top-full z-[101] mt-2 w-[17.5rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-slate-900 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)]"
              role="menu"
            >
              <div className="border-b border-slate-100 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${user ? getRoleColor(user.role) : navSkin.fallbackGrad} text-sm font-semibold text-white`}
                  >
                    {user?.avatarInitials || '—'}
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-slate-900">
                      {user?.name ?? 'Guest'}
                    </h4>
                    {`${user?.name ?? ''} ${user?.email ?? ''}`
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, '')
                      .match(/yashrajtomar|rishimehto/) ? (
                      <p className="text-xs font-medium text-[#1c0770]">Ultra Admin</p>
                    ) : null}
                    <p className="truncate text-xs text-slate-500">{user?.email ?? '—'}</p>
                    <p className="mt-1 inline-flex max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {stationDisplayName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-1.5">
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  onClick={() => {
                    setActiveDropdown(null);
                    setProfileOpen(true);
                  }}
                >
                  <User className="h-4 w-4 text-slate-400" />
                  View profile
                </button>
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  onClick={() => {
                    setActiveDropdown(null);
                    setRaiseTicketOpen(true);
                  }}
                >
                  <Ticket className="h-4 w-4 text-slate-400" />
                  Raise ticket
                </button>
                {canChangeStation ? (
                  <button
                    type="button"
                    className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    onClick={() => {
                      setActiveDropdown(null);
                      setChangeStationOpen(true);
                    }}
                  >
                    <MapPin className="h-4 w-4 text-slate-400" />
                    Change station
                  </button>
                ) : null}
                <div className="my-1.5 h-px bg-slate-100" />
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu - scrollable when open (portrait + landscape phones) */}
      <div
        className={`
          nav-desktop:hidden transition-[max-height,opacity] duration-300 ease-in-out
          ${isOpen ? `${MOBILE_MENU_OPEN_CLASS} opacity-100 mt-2` : 'max-h-0 overflow-hidden opacity-0 pointer-events-none'}
        `}
      >
        <div className="mx-4 rounded-xl border border-gray-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg">
          {/* Role Information */}
          {user && (
            <div className={`mb-4 p-3 ${navSkin.mobileRoleBg} rounded-lg`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-600">
                    {getRoleDisplayName(user.role)}
                  </p>
                </div>
                <div
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}
                >
                  {stationDisplayName}
                </div>
              </div>
            </div>
          )}

          {navItems.map((item) => (
            <div key={item.id} className="dropdown-container">
              <div className="flex items-center justify-between">
                {item.hasDropdown ? (
                  <button
                    type="button"
                    className={`
                    flex items-center space-x-2 px-3 py-3
                    font-medium rounded-lg w-full text-left
                    transition-colors duration-200
                    ${navSkin.softHover}
                    focus:outline-none ${navSkin.linkFocus}
                    ${isNavItemActive(item) ? navSkin.mobileItemActive : navSkin.mobileItemIdle}
                  `}
                    onClick={(e) => toggleDropdown(e, item.id)}
                  >
                    {item.icon && (
                      <span className={isNavItemActive(item) ? navSkin.linkActiveIcon : 'text-gray-500'}>
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <AppNavLink
                    href={item.path}
                    className={`
                    flex items-center space-x-2 px-3 py-3
                    font-medium rounded-lg
                    transition-colors duration-200
                    ${navSkin.softHover} w-full
                    focus:outline-none ${navSkin.linkFocus}
                    ${isNavItemActive(item) ? navSkin.mobileItemActive : navSkin.mobileItemIdle}
                  `}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.icon && (
                      <span className={isNavItemActive(item) ? navSkin.linkActiveIcon : 'text-gray-500'}>
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </AppNavLink>
                )}

                {item.hasDropdown && (
                  <button
                    className="p-2"
                    onClick={(e) => toggleDropdown(e, item.id)}
                    aria-label={`Toggle ${item.label} dropdown`}
                  >
                    <ChevronDown
                      className={`
                        w-4 h-4 transition-transform duration-200
                        ${activeDropdown === item.id ? 'rotate-180' : ''}
                        ${isNavItemActive(item) ? navSkin.linkActiveIcon : 'text-gray-500'}
                      `}
                    />
                  </button>
                )}
              </div>

              {/* Mobile dropdown menu */}
              {item.hasDropdown && item.dropdownItems && (
                <div
                  className={`
                    transition-all duration-200
                    ${getMobileDropdownPanelMaxClass(item.id, activeDropdown === item.id)}
                    ${activeDropdown !== item.id ? ' opacity-0' : ' opacity-100'}
                  `}
                >
                  <div className="space-y-1 py-2 pl-6">
                    {((item.id === REPORTS_NAV_ITEM_ID ||
                      BILLING_CHROME_NAV_IDS.has(item.id)) &&
                      activeDropdown === item.id)
                      ? flattenReportsDropdownItems(item.dropdownItems).map(
                          (row, index) =>
                            row.isHeader ? (
                              <div
                                key={`${row.path}-${index}`}
                                className="flex items-center space-x-2 px-3 py-2 cursor-default select-none"
                              >
                                {row.icon && (
                                  <span className="text-gray-400">{row.icon}</span>
                                )}
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  {row.label}
                                </span>
                              </div>
                            ) : (
                            <AppNavLink
                              key={`${row.path}-${index}`}
                              href={row.path}
                              className={`
                              flex items-center space-x-2 px-3 py-2 rounded-lg
                              transition-colors duration-150 ${navSkin.softHover}
                              focus:outline-none ${navSkin.linkFocus}
                              ${row.indent ? 'ml-4 bg-gray-50/80' : 'w-full'}
                              ${isActive(row.path) ? navSkin.linkActive : `text-gray-600 ${billingNavbarChrome ? 'hover:text-[#261CC1]' : 'hover:text-emerald-600'}`}
                            `}
                              onClick={() => setIsOpen(false)}
                            >
                              {row.icon && (
                                <span className="text-gray-400">{row.icon}</span>
                              )}
                              <span className="text-sm">{row.label}</span>
                            </AppNavLink>
                          ),
                        )
                      : item.dropdownItems.map((dropdownItem, index) => (
                      <div
                        key={index}
                        onMouseEnter={() => {
                          if (dropdownItem.hasNestedDropdown) {
                            setActiveNestedDropdown(dropdownItem.label);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <AppNavLink
                            href={dropdownItem.path}
                            className={`
                              flex items-center space-x-2 px-3 py-2
                              rounded-lg transition-colors duration-150
                              ${navSkin.softHover}
                              focus:outline-none ${navSkin.linkFocus}
                              ${isDropdownItemActive(dropdownItem) ? navSkin.linkActive : `text-gray-600 ${billingNavbarChrome ? 'hover:text-[#261CC1]' : 'hover:text-emerald-600'}`}
                              ${dropdownItem.hasNestedDropdown ? 'flex-1' : 'w-full'}
                              ${dropdownItem.hasNestedDropdown && activeNestedDropdown === dropdownItem.label ? navSkin.nestedOpen : ''}
                            `}
                            onClick={() => {
                              if (!dropdownItem.hasNestedDropdown) setIsOpen(false);
                            }}
                          >
                            {dropdownItem.icon && (
                              <span
                                className={
                                  isDropdownItemActive(dropdownItem)
                                    ? navSkin.linkActiveIcon
                                    : 'text-gray-400'
                                }
                              >
                                {dropdownItem.icon}
                              </span>
                            )}
                            <span className="text-sm">
                              {dropdownItem.label}
                            </span>
                          </AppNavLink>
                          {dropdownItem.hasNestedDropdown && (
                            <button
                              className="p-2"
                              onClick={(e) =>
                                toggleNestedDropdown(e, dropdownItem.label)
                              }
                            >
                              <ChevronDown
                                className={`
                                  w-4 h-4 transition-transform duration-200
                                  ${activeNestedDropdown === dropdownItem.label ? 'rotate-180' : ''}
                                `}
                              />
                            </button>
                          )}
                        </div>

                        {/* Mobile nested dropdown */}
                        {dropdownItem.hasNestedDropdown &&
                          dropdownItem.nestedItems && (
                            <div
                              className={`
                                overflow-hidden transition-all duration-200
                                ${activeNestedDropdown === dropdownItem.label ? 'max-h-64' : 'max-h-0 pointer-events-none'}
                              `}
                            >
                              <div className="pl-6 bg-gray-50/50 rounded-lg ml-2">
                                {dropdownItem.nestedItems.map(
                                  (nestedItem, nestedIndex) => (
                                    <AppNavLink
                                      key={nestedIndex}
                                      href={nestedItem.path}
                                      className={`
                                        flex items-center space-x-2 px-3 py-2
                                        text-sm rounded-lg transition-colors duration-150
                                        ${navSkin.softHover}
                                        focus:outline-none ${navSkin.linkFocus}
                                        ${isActive(nestedItem.path) ? navSkin.linkActive : `text-gray-600 ${billingNavbarChrome ? 'hover:text-[#261CC1]' : 'hover:text-emerald-600'}`}
                                      `}
                                      onClick={() => setIsOpen(false)}
                                    >
                                      {nestedItem.icon && (
                                        <span
                                          className={
                                            isActive(nestedItem.path)
                                              ? navSkin.linkActiveIcon
                                              : 'text-gray-400'
                                          }
                                        >
                                          {nestedItem.icon}
                                        </span>
                                      )}
                                      <span>{nestedItem.label}</span>
                                    </AppNavLink>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Mobile Profile Section — dropdown-container keeps outside-click handler from swallowing taps */}
          <div className="dropdown-container border-t border-gray-200 mt-4 pt-4">
            <button
              type="button"
              aria-expanded={activeDropdown === 9999}
              aria-haspopup="menu"
              className={`
                flex w-full min-h-[44px] touch-manipulation items-center space-x-3
                rounded-lg bg-gray-50 p-3 text-left
                transition-colors duration-150
                hover:bg-gray-100 active:bg-gray-100
                focus:outline-none ${navSkin.focusVisibleRing}
              `}
              onClick={(e) => toggleDropdown(e, 9999)}
            >
              <div
                className={`
                  flex h-12 w-12 shrink-0 items-center justify-center rounded-full
                  bg-gradient-to-br ${user ? getRoleColor(user.role) : navSkin.fallbackGrad}
                  text-white font-bold
                  border-2 border-white shadow
                `}
              >
                {user?.avatarInitials || <User className="w-6 h-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate font-bold text-gray-900">
                  {user?.name ?? 'Guest'}
                </h4>
                <p className="truncate text-sm text-gray-600">
                  {user ? getRoleDisplayName(user.role) : '—'}
                </p>
              </div>

              <ChevronDown
                className={`
                  h-5 w-5 shrink-0 text-gray-500
                  transition-transform duration-200
                  ${activeDropdown === 9999 ? `rotate-180 ${navSkin.avatarChevronOpen}` : ''}
                `}
              />
            </button>

            {/* Mobile Profile Dropdown */}
            <div
              className={`
                overflow-hidden transition-all duration-200
                ${activeDropdown === 9999 ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}
              `}
              role="menu"
            >
              <div className="space-y-1 py-2 pl-2">
                <AppNavLink
                  href="/fris/profile"
                  role="menuitem"
                  className={`
                    flex min-h-[44px] touch-manipulation items-center space-x-3 rounded-lg px-3 py-3
                    transition-colors duration-150 active:scale-[0.99]
                    ${navSkin.softHover} focus:outline-none ${navSkin.linkFocusVisible}
                    ${isActive('/fris/profile') ? navSkin.linkActive : navSkin.mobileItemIdle}
                  `}
                  onClick={() => {
                    setIsOpen(false);
                    setActiveDropdown(null);
                  }}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span>View Profile</span>
                </AppNavLink>

                <button
                  type="button"
                  role="menuitem"
                  className={`
                    flex min-h-[44px] w-full touch-manipulation items-center space-x-3
                    rounded-lg px-3 py-3 text-left text-gray-700
                    transition-colors duration-150 active:scale-[0.99]
                    ${navSkin.linkHover}
                    focus:outline-none ${navSkin.linkFocusVisible}
                  `}
                  onClick={() => {
                    setIsOpen(false);
                    setActiveDropdown(null);
                    setRaiseTicketOpen(true);
                  }}
                >
                  <Ticket className="h-4 w-4 shrink-0" />
                  <span>Raise Ticket</span>
                </button>

                {canChangeStation ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={`
                      flex min-h-[44px] w-full touch-manipulation items-center space-x-3
                      rounded-lg px-3 py-3 text-left text-gray-700
                      transition-colors duration-150 active:scale-[0.99]
                      ${navSkin.linkHover}
                      focus:outline-none ${navSkin.linkFocusVisible}
                    `}
                    onClick={() => {
                      setIsOpen(false);
                      setActiveDropdown(null);
                      setChangeStationOpen(true);
                    }}
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>Change station</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleLogout()}
                  className="
                    flex min-h-[44px] w-full touch-manipulation items-center space-x-3
                    rounded-lg px-3 py-3 text-left text-red-600
                    transition-colors duration-150 active:scale-[0.99]
                    hover:bg-red-50 hover:text-red-700
                    focus:outline-none focus-visible:bg-red-50
                  "
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <EmployeeProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ChangeStationDialog
        open={changeStationOpen}
        currentCode={sessionStationCode}
        onClose={() => setChangeStationOpen(false)}
      />
      <RaiseTicketDialog
        open={raiseTicketOpen}
        onOpenChange={setRaiseTicketOpen}
        navSections={ticketNavSections}
        currentPath={pathname ?? ''}
      />
    </nav>
  );
};

function BillingNightToggle() {
  const [night, setNight] = useState(false);

  useEffect(() => {
    const on = localStorage.getItem('billing-night') === '1';
    setNight(on);
    document.documentElement.toggleAttribute('data-billing-night', on);
  }, []);

  const toggle = () => {
    const next = !night;
    setNight(next);
    localStorage.setItem('billing-night', next ? '1' : '0');
    document.documentElement.toggleAttribute('data-billing-night', next);
    window.dispatchEvent(new Event('billing-night-change'));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={night}
      aria-label={night ? 'Switch to light appearance' : 'Switch to dark appearance'}
      title={night ? 'Light' : 'Dark'}
      className="billing-night-toggle inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-[#f2f2f7] text-[#1c1c1e] transition hover:bg-[#e5e5ea]"
    >
      {night ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export default Navbar;