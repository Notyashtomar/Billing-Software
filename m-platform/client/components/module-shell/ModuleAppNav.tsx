'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, FileText, LogOut, Ticket, User } from 'lucide-react';
import { RaiseTicketDialog } from '@/components/fris/layout/RaiseTicketDialog';
import { StationCompanyLogo } from '@/components/fris/layout/StationCompanyLogo';
import {
  formatLoginStationDisplay,
  getStoredLoginStationContext,
  persistLoginStationContext,
} from '@/lib/station-company-logo';
import {
  buildTicketNavSections,
  moduleNavItemsToTicketSource,
} from '@/lib/ticket-nav-pages';
import { cn } from '@/lib/utils';
import type { ModuleAppNavProps, ModuleNavItem } from './types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function isActive(pathname: string, item: ModuleNavItem): boolean {
  if (item.children?.length) {
    return item.children.some(
      (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
    );
  }
  if (!item.href) return false;
  if (item.exact) {
    return pathname === item.href || pathname === `${item.href}/`;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function navItemClass(active: boolean, open: boolean): string {
  const on = active || open;
  return [
    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]',
    on
      ? 'border-[var(--mod-accent)] bg-[var(--mod-accent-soft)] text-[var(--mod-nav-text)]'
      : 'border-transparent text-[var(--mod-nav-text)] hover:border-[color-mix(in_srgb,var(--mod-accent)_55%,transparent)] hover:bg-[var(--mod-accent-soft)]',
  ].join(' ');
}

/**
 * Shared ops-module navbar — logo left · links center · FRIS-style profile right.
 * Active/hover = accent border + soft wash (never solid fill tiles).
 *
 * New module: pass `theme` + `items` + session handlers. Do not fork markup.
 */
export default function ModuleAppNav({
  ariaLabel,
  hubHref,
  theme,
  items,
  stationCode,
  userName,
  appsHref,
  onLogout,
  logoStation,
  userManualHref,
  beforeAvatar,
  centerTools,
  userEmail,
  stationLabel,
  profileHref,
  enableRaiseTicket = true,
}: ModuleAppNavProps) {
  const pathname = usePathname() || '';
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [raiseTicketOpen, setRaiseTicketOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const profileMenuId = useId();
  const avatar = initials(userName);

  const ticketNavSections = useMemo(
    () => buildTicketNavSections(moduleNavItemsToTicketSource(items)),
    [items],
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t)) {
        setOpenId(null);
        setMobileOpen(false);
      }
      if (!profileRef.current?.contains(t)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const stored = getStoredLoginStationContext();
  const effectiveCode =
    String(stationCode || stored.stationCode || '')
      .trim()
      .toUpperCase();
  const logoInput = logoStation ?? {
    stationCode: effectiveCode || stored.stationCode,
    city: stored.city,
  };
  const stationDisplay =
    formatLoginStationDisplay({
      stationCode: effectiveCode || stored.stationCode,
      city: stored.city,
    }) ||
    stationLabel?.trim() ||
    '—';

  useEffect(() => {
    if (!effectiveCode) return;
    persistLoginStationContext({ stationCode: effectiveCode });
  }, [effectiveCode]);

  const cssVars = {
    ['--mod-ink' as string]: theme.ink,
    ['--mod-ink-deep' as string]: theme.inkDeep ?? theme.ink,
    ['--mod-accent' as string]: theme.accent,
    ['--mod-accent-soft' as string]: theme.accentSoft,
    ['--mod-nav-text' as string]: theme.navText,
    ['--mod-nav-muted' as string]: theme.navTextMuted,
    ['--mod-on-accent' as string]: theme.onAccent,
    ['--mod-border' as string]: theme.border,
    ['--mod-dropdown-text' as string]: theme.dropdownText,
    background: theme.ink,
    borderColor: theme.border,
    boxShadow: theme.shadow,
  };

  return (
    <nav
      ref={rootRef}
      className="sticky top-0 z-40 w-full border-b shadow-sm"
      style={cssVars}
      aria-label={ariaLabel}
    >
      <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-5">
        <Link
          href={hubHref}
          className="flex min-w-0 shrink-0 items-center justify-self-start"
          aria-label={`${ariaLabel} hub · ${stationCode || '—'}`}
        >
          <span className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white px-2 py-1 shadow-sm">
            <StationCompanyLogo
              station={logoInput}
              className="h-9 w-auto max-w-[11rem]"
              alt="Station company logo"
            />
          </span>
        </Link>

        <div className="hidden items-center justify-center gap-2 justify-self-center lg:flex">
          <div className="flex items-center gap-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);
              const open = openId === item.id;

              if (item.children?.length) {
                return (
                  <div
                    key={item.id}
                    className="relative"
                    onMouseEnter={() => setOpenId(item.id)}
                    onMouseLeave={() => setOpenId(null)}
                  >
                    <button
                      type="button"
                      className={navItemClass(active, open)}
                      aria-expanded={open}
                      aria-haspopup="menu"
                      aria-controls={`${menuId}-${item.id}`}
                      onClick={() => setOpenId(open ? null : item.id)}
                    >
                      {Icon ? (
                        <Icon
                          className="size-3.5 shrink-0 opacity-90"
                          aria-hidden
                        />
                      ) : null}
                      <span className="whitespace-nowrap">{item.label}</span>
                      <ChevronDown
                        className={`size-3.5 transition ${open ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>
                    {open ? (
                      <div
                        id={`${menuId}-${item.id}`}
                        role="menu"
                        className="absolute left-1/2 top-full z-50 mt-0 min-w-[200px] -translate-x-1/2 rounded-lg border bg-white py-1 shadow-md"
                        style={{ borderColor: theme.border }}
                      >
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            role="menuitem"
                            href={child.href}
                            className="block px-3 py-2 text-sm transition hover:bg-[var(--mod-accent-soft)]"
                            style={{ color: 'var(--mod-dropdown-text)' }}
                            onClick={() => setOpenId(null)}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.href || hubHref}
                  className={navItemClass(active, false)}
                >
                  {Icon ? (
                    <Icon
                      className="size-3.5 shrink-0 opacity-90"
                      aria-hidden
                    />
                  ) : null}
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </div>
          {centerTools}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 justify-self-end sm:gap-2">
          {userManualHref ? (
            <Link
              href={userManualHref}
              className="hidden items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-xs font-medium transition hover:border-[color-mix(in_srgb,var(--mod-accent)_45%,transparent)] hover:bg-[var(--mod-accent-soft)] md:inline-flex"
              style={{ color: 'var(--mod-nav-muted)' }}
            >
              <FileText className="size-3.5" aria-hidden />
              User Manual
            </Link>
          ) : null}
          <Link
            href={appsHref}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--mod-accent)] hover:bg-[var(--mod-accent-soft)]"
            style={{
              color: 'var(--mod-nav-text)',
              borderColor: 'rgba(255,255,255,0.28)',
            }}
          >
            Apps
          </Link>
          {beforeAvatar}

          {/* FRIS-parity profile: avatar + chevron → dropdown */}
          <div ref={profileRef} className="relative shrink-0">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              aria-controls={profileMenuId}
              title={userName}
              onClick={() => {
                setProfileOpen((v) => !v);
                setOpenId(null);
              }}
              className={cn(
                'group box-border flex h-9 max-h-9 shrink-0 items-center gap-2 rounded-full border-2 px-2.5 transition-[background-color,border-color,box-shadow] duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mod-ink)]',
                profileOpen
                  ? 'border-[var(--mod-accent)] bg-[var(--mod-accent-soft)] shadow-sm'
                  : 'border-transparent bg-white/10 hover:bg-white/15',
              )}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/90 text-[11px] font-semibold shadow-sm transition-transform duration-200 group-hover:scale-[1.03]"
                style={{
                  background: 'var(--mod-accent)',
                  color: 'var(--mod-on-accent)',
                }}
              >
                {avatar}
              </span>
              <span
                className="hidden max-w-[7rem] truncate text-sm font-medium lg:inline"
                style={{ color: 'var(--mod-nav-text)' }}
              >
                {userName}
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 transition-transform duration-200',
                  profileOpen ? 'rotate-180' : '',
                )}
                style={{ color: 'var(--mod-nav-muted)' }}
                aria-hidden
              />
            </button>

            {profileOpen ? (
              <div
                id={profileMenuId}
                role="menu"
                className="absolute right-0 top-full z-[101] mt-2 min-w-[240px] overflow-hidden rounded-xl border bg-white shadow-xl"
                style={{ borderColor: 'rgba(15,23,42,0.08)' }}
              >
                <div
                  className="border-b p-4"
                  style={{
                    borderColor: 'rgba(15,23,42,0.08)',
                    background:
                      'linear-gradient(90deg, color-mix(in srgb, var(--mod-accent) 35%, white), color-mix(in srgb, var(--mod-accent) 12%, white))',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white text-lg font-bold shadow"
                      style={{
                        background: theme.ink,
                        color: theme.navText,
                      }}
                    >
                      {avatar}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate font-bold text-slate-900">
                        {userName || 'Guest'}
                      </h4>
                      <p className="truncate text-sm text-slate-600">
                        {userEmail?.trim() || '—'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Station: {stationDisplay}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="py-2">
                  {profileHref ? (
                    <Link
                      href={profileHref}
                      role="menuitem"
                      className="flex items-center gap-3 px-4 py-3 text-slate-700 transition-all duration-150 hover:bg-[var(--mod-accent-soft)] hover:text-[var(--mod-dropdown-text)] focus:outline-none"
                      onClick={() => setProfileOpen(false)}
                    >
                      <User className="size-4 text-slate-400" aria-hidden />
                      <span className="font-medium">View Profile</span>
                    </Link>
                  ) : null}

                  {enableRaiseTicket ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-slate-700 transition-all duration-150 hover:bg-[var(--mod-accent-soft)] hover:text-[var(--mod-dropdown-text)] focus:outline-none"
                      onClick={() => {
                        setProfileOpen(false);
                        setRaiseTicketOpen(true);
                      }}
                    >
                      <Ticket className="size-4 text-slate-400" aria-hidden />
                      <span className="font-medium">Raise Ticket</span>
                    </button>
                  ) : null}

                  <div className="my-1 border-t border-slate-100" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-red-600 transition-all duration-150 hover:bg-red-50 hover:text-red-700 focus:bg-red-50 focus:outline-none"
                  >
                    <LogOut className="size-4" aria-hidden />
                    <span className="font-medium">Logout</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="inline-flex rounded-lg border p-2 transition hover:border-[var(--mod-accent)] hover:bg-[var(--mod-accent-soft)] lg:hidden"
            style={{
              color: 'var(--mod-nav-text)',
              borderColor: 'rgba(255,255,255,0.28)',
            }}
            aria-expanded={mobileOpen}
            aria-label="Open menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <ChevronDown
              className={`size-4 transition ${mobileOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          className="border-t px-3 py-2 lg:hidden"
          style={{
            background: 'var(--mod-ink-deep)',
            borderColor: theme.border,
          }}
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className={`block ${navItemClass(isActive(pathname, item), false)}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : null}
                {item.children?.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className={`ml-2 mt-1 block ${navItemClass(
                      pathname === c.href || pathname.startsWith(`${c.href}/`),
                      false,
                    )}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {c.label}
                  </Link>
                ))}
              </li>
            ))}
            {userManualHref ? (
              <li>
                <Link
                  href={userManualHref}
                  className="mt-1 block rounded-lg border border-transparent px-3 py-2 text-sm transition hover:border-[color-mix(in_srgb,var(--mod-accent)_45%,transparent)]"
                  style={{ color: 'var(--mod-nav-muted)' }}
                  onClick={() => setMobileOpen(false)}
                >
                  User Manual
                </Link>
              </li>
            ) : null}
            <li className="mt-2 border-t pt-2" style={{ borderColor: theme.border }}>
              <div className="px-2.5 py-1.5 text-xs" style={{ color: 'var(--mod-nav-muted)' }}>
                {userName}
                {userEmail ? ` · ${userEmail}` : ''}
              </div>
              {profileHref ? (
                <Link
                  href={profileHref}
                  className={`${navItemClass(false, false)} mt-1 block`}
                  onClick={() => setMobileOpen(false)}
                >
                  View Profile
                </Link>
              ) : null}
              {enableRaiseTicket ? (
                <button
                  type="button"
                  className={`${navItemClass(false, false)} mt-1 w-full justify-start text-left`}
                  onClick={() => {
                    setMobileOpen(false);
                    setRaiseTicketOpen(true);
                  }}
                >
                  Raise Ticket
                </button>
              ) : null}
              <button
                type="button"
                className={`${navItemClass(false, false)} mt-1 w-full justify-start text-left`}
                onClick={() => {
                  setMobileOpen(false);
                  onLogout();
                }}
              >
                Logout
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      {enableRaiseTicket ? (
        <RaiseTicketDialog
          open={raiseTicketOpen}
          onOpenChange={setRaiseTicketOpen}
          navSections={ticketNavSections}
          currentPath={pathname}
        />
      ) : null}
    </nav>
  );
}
