'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/billing/settings', label: 'Profile' },
  { href: '/billing/settings/taxes', label: 'Tax rules' },
  { href: '/billing/settings/sequences', label: 'Invoice sequences' },
] as const;

export function SettingsSubNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mb-6 flex flex-wrap gap-1 rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-1 shadow-[var(--billing-shadow-sm)]"
      aria-label="Billing settings"
    >
      {LINKS.map((link) => {
        const active =
          link.href === '/billing/settings'
            ? pathname === '/billing/settings'
            : pathname === link.href || pathname?.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-[var(--billing-radius)] px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              active
                ? 'bg-[color:var(--billing-primary)] text-[color:var(--billing-text-inverse)] shadow-[var(--billing-shadow-sm)]'
                : 'text-[color:var(--billing-text-muted)] hover:bg-[color:var(--billing-surface-muted)] hover:text-[color:var(--billing-text)]'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
