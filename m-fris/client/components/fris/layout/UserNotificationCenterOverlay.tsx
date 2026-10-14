'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';

import { useAdminPanelOptional } from '@/contexts/AdminPanelContext';
import { useAdminShotNotification } from '@/contexts/UserNotificationCenterContext';
import { cn } from '@/lib/utils';

function useShotNotificationTheme() {
  const admin = useAdminPanelOptional();
  const [htmlDark, setHtmlDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setHtmlDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return admin?.isDark ?? htmlDark;
}

export function UserNotificationCenterOverlay() {
  const { activeOverlay, dismissOverlay } = useAdminShotNotification();
  const isDark = useShotNotificationTheme();

  return (
    <AnimatePresence>
      {activeOverlay ? (
        <motion.div
          key={activeOverlay.id}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`universal-notif-title-${activeOverlay.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          aria-live="assertive"
        >
          <motion.button
            type="button"
            aria-label="Dismiss notification backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'absolute inset-0 backdrop-blur-[2px]',
              isDark ? 'bg-slate-950/70' : 'bg-slate-950/45',
            )}
            onClick={dismissOverlay}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={cn(
              'relative z-10 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl',
              isDark
                ? 'border-emerald-400/25 bg-[#0c1411] shadow-emerald-500/15'
                : 'border-emerald-200/80 bg-white shadow-emerald-500/20',
            )}
          >
            <div
              className={cn(
                'bg-gradient-to-r px-5 py-4',
                isDark
                  ? 'from-emerald-600 to-emerald-700 text-emerald-50'
                  : 'from-emerald-600 to-emerald-500 text-white',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Bell className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p
                      className={cn(
                        'text-xs font-medium uppercase tracking-wide',
                        isDark ? 'text-emerald-200/90' : 'text-emerald-100',
                      )}
                    >
                      Notification
                    </p>
                    <h2
                      id={`universal-notif-title-${activeOverlay.id}`}
                      className="text-lg font-bold leading-tight"
                    >
                      {activeOverlay.title}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissOverlay}
                  className="rounded-lg p-1.5 text-white/90 transition hover:bg-white/15"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="px-5 py-4">
              <p
                className={cn(
                  'whitespace-pre-wrap text-sm leading-relaxed',
                  isDark ? 'text-slate-200' : 'text-slate-700',
                )}
              >
                {activeOverlay.message}
              </p>
              {activeOverlay.shotByAdminName ? (
                <p className={cn('mt-3 text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  From admin: {activeOverlay.shotByAdminName}
                </p>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
