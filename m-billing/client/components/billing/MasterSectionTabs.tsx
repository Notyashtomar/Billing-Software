'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clientMayUseBwmsAppPage } from '@/lib/bwms-app-page-catalog';

const GROUPS = {
  customers: [
    { href: '/billing/customers', label: 'Customers', pageId: 'customers' },
    { href: '/billing/service-catalog', label: 'Service catalog', pageId: 'service-catalog' },
  ],
  rates: [{ href: '/billing/rate-cards', label: 'Rate cards', pageId: 'rate-cards' }],
} as const;

export function MasterSectionTabs({ group }: { group: keyof typeof GROUPS }) {
  const pathname = usePathname() ?? '';
  const links = GROUPS[group].filter((link) =>
    clientMayUseBwmsAppPage('billing-finance', link.pageId),
  );
  if (links.length < 2) return null;

  return (
    <nav
      className="mb-4 flex flex-wrap gap-1 rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-1"
      aria-label={group === 'customers' ? 'Customers' : 'Rate cards'}
    >
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-[var(--billing-radius)] px-3 py-2 text-sm font-medium ${
              active
                ? 'bg-[color:var(--billing-primary)] text-[color:var(--billing-text-inverse)]'
                : 'text-[color:var(--billing-text-muted)] hover:bg-[color:var(--billing-surface-muted)]'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
