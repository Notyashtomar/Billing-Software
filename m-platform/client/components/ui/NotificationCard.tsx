'use client';

import { useRouter } from 'next/navigation';
import { Clock, Plane, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type DashboardNotification,
  type NotificationType,
  CANCELLATION_ALERTS_PATH,
  CANCELLATION_HIGHLIGHT_STORAGE_KEY,
} from '@/contexts/DashboardNotificationContext';

const EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

const TYPE_META: Record<
  NotificationType,
  { label: string; Icon: typeof Plane; iconClass: string; accentBorder: string; iconBg: string }
> = {
  flight_cancelled: {
    label: 'Cancellation',
    Icon: XCircle,
    iconClass: 'text-[var(--dash-negative)]',
    iconBg: 'bg-[color-mix(in_srgb,var(--dash-negative)_12%,transparent)]',
    accentBorder: 'border-[color-mix(in_srgb,var(--dash-negative)_28%,var(--dash-border))]',
  },
  new_flight: {
    label: 'New flight',
    Icon: Plane,
    iconClass: 'text-[var(--dash-accent)]',
    iconBg: 'bg-[var(--dash-accent-surface)]',
    accentBorder: 'border-[color-mix(in_srgb,var(--dash-accent)_22%,var(--dash-border))]',
  },
  delay: {
    label: 'Delay',
    Icon: Clock,
    iconClass: 'text-[var(--dash-warning)]',
    iconBg: 'bg-[color-mix(in_srgb,var(--dash-warning)_14%,transparent)]',
    accentBorder: 'border-[color-mix(in_srgb,var(--dash-warning)_28%,var(--dash-border))]',
  },
};

type NotificationCardProps = {
  notification: DashboardNotification;
  onDismiss: (id: string) => void;
  styleIndex: number;
};

export function NotificationCard({ notification, onDismiss, styleIndex }: NotificationCardProps) {
  const router = useRouter();
  const meta = TYPE_META[notification.type];
  const { Icon } = meta;
  const hasCancellationAction = (notification.highlightCancellationIds?.length ?? 0) > 0;

  const openAlertsAndHighlight = () => {
    const ids = (notification.highlightCancellationIds ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (ids.length > 0) {
      try {
        sessionStorage.setItem(CANCELLATION_HIGHLIGHT_STORAGE_KEY, JSON.stringify(ids));
      } catch {
        /* ignore quota / private mode */
      }
    }
    onDismiss(notification.id);
    router.push(CANCELLATION_ALERTS_PATH);
  };

  const isActionable = notification.type === 'flight_cancelled' && hasCancellationAction;

  return (
    <article
      role={isActionable ? 'button' : 'status'}
      tabIndex={isActionable ? 0 : undefined}
      data-cursor-interactive={isActionable ? true : undefined}
      onClick={isActionable ? openAlertsAndHighlight : undefined}
      onKeyDown={
        isActionable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openAlertsAndHighlight();
              }
            }
          : undefined
      }
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-[var(--dash-card)] text-left shadow-[var(--dash-shadow-card)] transition-[transform,box-shadow] duration-200 ease-out',
        meta.accentBorder,
        isActionable && 'cursor-pointer hover:shadow-[var(--dash-shadow-overlay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ring)]',
        isActionable && 'hover:-translate-y-px active:translate-y-0',
      )}
      style={{
        animation: `dashboardNotifEnter 0.22s ${EASE} both`,
        animationDelay: `${Math.min(styleIndex, 5) * 35}ms`,
      }}
    >
      <div className="flex gap-2.5 p-2.5 pr-8">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            meta.iconBg,
          )}
          aria-hidden
        >
          <Icon className={cn('h-4 w-4', meta.iconClass)} strokeWidth={2.25} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[var(--dash-text-strong)]">
            {notification.title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--dash-text-muted)]">
            {notification.message}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-[var(--dash-hover-surface)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--dash-text-soft)]">
              {meta.label}
            </span>
            {isActionable ? (
              <span className="text-[10px] font-medium text-[var(--dash-accent)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                View alerts →
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        data-cursor-interactive
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--dash-text-soft)] transition-colors hover:bg-[var(--dash-hover-surface)] hover:text-[var(--dash-text-strong)]"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </article>
  );
}
