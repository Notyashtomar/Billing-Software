import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { StationLogoInput } from '@/lib/station-company-logo';

/** Brand pack for ops-module chrome (CHR / ULD / TRP / GEMM / new modules). */
export type ModuleNavTheme = {
  /** Dark bar background */
  ink: string;
  /** Mobile drawer background */
  inkDeep?: string;
  /** Accent border / avatar (lime, maroon, gold, …) */
  accent: string;
  /** Soft accent wash for active/hover (rgba recommended) */
  accentSoft: string;
  navText: string;
  navTextMuted: string;
  /** Text on accent-filled avatar */
  onAccent: string;
  /** Hairline on bar / dropdown */
  border: string;
  /** Dropdown item text on white menu */
  dropdownText: string;
  shadow?: string;
};

export type ModuleNavChild = {
  label: string;
  href: string;
};

export type ModuleNavItem = {
  id: string;
  label: string;
  href?: string;
  icon?: LucideIcon;
  children?: ModuleNavChild[];
  /** Exact path match only (hub / dashboard). */
  exact?: boolean;
};

export type ModuleAppNavProps = {
  ariaLabel: string;
  hubHref: string;
  theme: ModuleNavTheme;
  items: ModuleNavItem[];
  stationCode: string;
  userName: string;
  appsHref: string;
  onLogout: () => void;
  /** Station company logo resolution (BAS/BFS/GSEC). */
  logoStation?: StationLogoInput;
  userManualHref?: string;
  /** Optional controls before the user avatar (e.g. theme toggle). */
  beforeAvatar?: ReactNode;
  /** Optional tools near nav center (search / export). */
  centerTools?: ReactNode;
  /** Email shown in FRIS-style profile dropdown. */
  userEmail?: string;
  /** Station label under profile (defaults to stationCode). */
  stationLabel?: string;
  /** Optional profile page link (FRIS-style "View Profile"). */
  profileHref?: string;
  /**
   * Show Raise Ticket in profile menu (default true).
   * Uses shared FRIS RaiseTicketDialog → Nest support_tickets.
   */
  enableRaiseTicket?: boolean;
};
