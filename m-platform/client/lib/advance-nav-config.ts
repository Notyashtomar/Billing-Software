import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Boxes,
  Building2,
  Calendar,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Database,
  FileSpreadsheet,
  FileText,
  Hash,
  Image,
  Layers,
  Phone,
  Plane,
  Server,
  Settings,
  Sparkles,
  UserCog,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';

export type AdvanceTabId =
  | 'gateway'
  | 'schedule'
  | 'schedule-equipment'
  | 'cargo'
  | 'gh-representative'
  | 'invoicing'
  | 'alert';

export type GatewaySectionId =
  | 'scheduled-airlines'
  | 'airline'
  | 'aircraft'
  | 'equipment-manpower'
  | 'manpower'
  | 'staff'
  | 'contact'
  | 'airline-logo'
  | 'raf-airline'
  | 'non-scheduled-airline'
  | 'terminal'
  | 'other-services'
  | 'dcs-master'
  | 'aircraft-registration'
  | 'ams-services';

export type InvoicingSectionId =
  | 'scheduled-flight-data'
  | 'cleaning-services'
  | 'non-scheduled-flight-data'
  | 'maas-services'
  | 'raf-ramp-assistance'
  | 'cancel-scheduled-flight-data'
  | 'cancel-non-scheduled-flight-data'
  | 'handling-status-report';

export type CargoSectionId =
  | 'cargo-airline'
  | 'scheduled'
  | 'services'
  | 'flight-creation'
  | 'unit-master';

export type AdvanceNavItem<T extends string = string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  description?: string;
  hasSubPages?: boolean;
};

export const ADVANCE_TABS: AdvanceNavItem<AdvanceTabId>[] = [
  {
    id: 'gateway',
    label: 'Gateway',
    icon: CreditCard,
    description: 'Airlines, aircraft, staff, terminals, and masters',
    hasSubPages: true,
  },
  {
    id: 'schedule',
    label: 'Schedule Setup',
    icon: Calendar,
    description: 'Configure scheduled airline flights',
  },
  {
    id: 'schedule-equipment',
    label: 'Schedule Equipment Setup',
    icon: Settings,
    description: 'Equipment allocation for schedules',
  },
  {
    id: 'cargo',
    label: 'Cargo',
    icon: Layers,
    description: 'Cargo airlines, schedules, and services',
    hasSubPages: true,
  },
  {
    id: 'gh-representative',
    label: 'GH Representative',
    icon: Users,
    description: 'Ground handling representative records',
  },
  {
    id: 'invoicing',
    label: 'Invoicing',
    icon: FileText,
    description: 'Flight data and handling invoices',
    hasSubPages: true,
  },
  {
    id: 'alert',
    label: 'Alert Setup',
    icon: Bell,
    description: 'Airline alert rules and notifications',
  },
];

export const GATEWAY_SECTIONS: AdvanceNavItem<GatewaySectionId>[] = [
  { id: 'scheduled-airlines', label: 'Scheduled Airlines', icon: Plane, description: 'Manage scheduled airline master data' },
  { id: 'airline', label: 'Airline', icon: Plane, description: 'Airline profiles and codes' },
  { id: 'aircraft', label: 'Aircraft', icon: Plane, description: 'Aircraft types and bodies' },
  { id: 'equipment-manpower', label: 'Equipment', icon: Boxes, description: 'Equipment categories and mapping' },
  { id: 'manpower', label: 'Manpower', icon: UserCog, description: 'Manpower roles and setup' },
  { id: 'staff', label: 'Staff', icon: Users, description: 'Staff directory and assignments' },
  { id: 'contact', label: 'Airline Contact', icon: Phone, description: 'Airline contact details' },
  { id: 'airline-logo', label: 'Logo of Airline', icon: Image, description: 'Airline logo assets' },
  { id: 'raf-airline', label: 'Raf Airline', icon: Plane, description: 'RAF airline configuration' },
  { id: 'non-scheduled-airline', label: 'Non Scheduled Airline', icon: Plane, description: 'Non-scheduled airline master' },
  { id: 'terminal', label: 'Terminal', icon: Building2, description: 'Terminal codes and locations' },
  { id: 'other-services', label: 'Other Services', icon: Layers, description: 'Additional service masters' },
  { id: 'dcs-master', label: 'DCS Master', icon: Database, description: 'DCS system master data' },
  { id: 'aircraft-registration', label: 'Aircraft Registration', icon: Hash, description: 'Aircraft registration numbers' },
  { id: 'ams-services', label: 'AMS Services', icon: Server, description: 'AMS service configuration' },
];

export const INVOICING_SECTIONS: AdvanceNavItem<InvoicingSectionId>[] = [
  { id: 'scheduled-flight-data', label: 'Scheduled Flight Data', icon: CalendarDays, description: 'Invoice scheduled flights' },
  { id: 'cleaning-services', label: 'Cleaning Services', icon: Sparkles, description: 'Cleaning service invoices' },
  { id: 'non-scheduled-flight-data', label: 'Non Scheduled Flight Data', icon: Plane, description: 'Non-scheduled flight invoices' },
  { id: 'maas-services', label: 'MAAS Services', icon: Layers, description: 'MAAS service invoices' },
  { id: 'raf-ramp-assistance', label: 'RAF', icon: FileSpreadsheet, description: 'RAF ramp assistance invoices' },
  { id: 'cancel-scheduled-flight-data', label: 'XXLD SKD', icon: XCircle, description: 'Cancelled scheduled flights' },
  { id: 'cancel-non-scheduled-flight-data', label: 'XXLD Non-SKD', icon: XCircle, description: 'Cancelled non-scheduled flights' },
  { id: 'handling-status-report', label: 'Handling Status Report', icon: ClipboardList, description: 'Handling status reporting' },
];

export const CARGO_SECTIONS: AdvanceNavItem<CargoSectionId>[] = [
  { id: 'cargo-airline', label: 'Create New Cargo Airline', icon: Plane, description: 'Add a cargo airline' },
  { id: 'scheduled', label: 'Create New Scheduled', icon: Calendar, description: 'Cargo scheduled flights' },
  { id: 'services', label: 'Services', icon: Wrench, description: 'Cargo service catalog' },
  { id: 'flight-creation', label: 'Flight Creation', icon: FileText, description: 'Create cargo flights' },
  { id: 'unit-master', label: 'Unit Master', icon: Database, description: 'Cargo unit master data' },
];

const ADVANCE_TAB_ID_SET = new Set<string>(ADVANCE_TABS.map((t) => t.id));
const GATEWAY_SECTION_ID_SET = new Set<string>(GATEWAY_SECTIONS.map((s) => s.id));
const CARGO_SECTION_ID_SET = new Set<string>(CARGO_SECTIONS.map((s) => s.id));
const INVOICING_SECTION_ID_SET = new Set<string>(INVOICING_SECTIONS.map((s) => s.id));

export function isAdvanceTabId(value: string | null | undefined): value is AdvanceTabId {
  return !!value && ADVANCE_TAB_ID_SET.has(value);
}

export function isGatewaySectionId(value: string | null | undefined): value is GatewaySectionId {
  return !!value && GATEWAY_SECTION_ID_SET.has(value);
}

export function isCargoSectionId(value: string | null | undefined): value is CargoSectionId {
  return !!value && CARGO_SECTION_ID_SET.has(value);
}

export function isInvoicingSectionId(value: string | null | undefined): value is InvoicingSectionId {
  return !!value && INVOICING_SECTION_ID_SET.has(value);
}

export function advanceTabHasSubPages(tab: AdvanceTabId): boolean {
  return ADVANCE_TABS.find((t) => t.id === tab)?.hasSubPages === true;
}

export function getAdvanceTabMeta(tab: AdvanceTabId) {
  return ADVANCE_TABS.find((t) => t.id === tab);
}

export function getGatewaySectionMeta(section: GatewaySectionId) {
  return GATEWAY_SECTIONS.find((s) => s.id === section);
}

export function getCargoSectionMeta(section: CargoSectionId) {
  return CARGO_SECTIONS.find((s) => s.id === section);
}

export function getInvoicingSectionMeta(section: InvoicingSectionId) {
  return INVOICING_SECTIONS.find((s) => s.id === section);
}

export function buildAdvanceHref(tab?: AdvanceTabId, section?: string): string {
  if (!tab) return '/fris/advance';
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (section) params.set('section', section);
  return `/fris/advance?${params.toString()}`;
}
