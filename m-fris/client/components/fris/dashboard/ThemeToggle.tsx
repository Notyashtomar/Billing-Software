'use client';

import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useDashboardTheme } from '@/components/fris/dashboard/DashboardThemeProvider';
import { useHoverCapable } from '@/lib/use-compact-picker-viewport';

import { cn } from '@/lib/utils';

const TOGGLE_SIZES = {
  default: {
    track: 'h-8 w-[60px]',
    knob: 'h-6 w-6',
    knobX: 28,
    icon: 'h-3.5 w-3.5',
    placeholder: 'h-8 w-[60px]',
  },
  sm: {
    track: 'h-7 w-[52px]',
    knob: 'h-5 w-5',
    knobX: 24,
    icon: 'h-3 w-3',
    placeholder: 'h-7 w-[52px]',
  },
} as const;

export type ThemeToggleProps = {
  className?: string;
  size?: keyof typeof TOGGLE_SIZES;
  /** Fires after the theme is switched (e.g. trigger layout animations). */
  onToggle?: () => void;
};

/**
 * Premium animated theme toggle (light / dark).
 * Requires `DashboardThemeProvider` above in the tree.
 */
function ThemeToggleComponent({ className, onToggle, size = 'default' }: ThemeToggleProps) {
  const s = TOGGLE_SIZES[size];
  const { resolved, setPreference } = useDashboardTheme();
  const hoverCapable = useHoverCapable();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolved === 'dark';

  const handleClick = () => {
    setPreference(isDark ? 'light' : 'dark');
    onToggle?.();
  };

  if (!mounted) {
    return (
      <div
        className={cn(s.placeholder, 'shrink-0 rounded-full border border-black/[0.05] bg-[#E0F2FE]', className)}
        aria-hidden
      />
    );
  }

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={handleClick}
      className={cn(
        'relative z-10 shrink-0 cursor-pointer touch-manipulation rounded-full border p-1 outline-none',
        s.track,
        'border-black/[0.05] dark:border-white/[0.08]',
        'focus-visible:ring-2 focus-visible:ring-emerald-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-card,#fff)] dark:focus-visible:ring-offset-slate-900',
        className
      )}
      whileHover={hoverCapable ? { scale: 1.05, filter: 'brightness(1.06)' } : undefined}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        initial={false}
        animate={{
          boxShadow: isDark
            ? '0 0 20px rgba(59, 130, 246, 0.35), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 0 18px rgba(245, 158, 11, 0.4), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-r from-[#E0F2FE] to-[#FFF7ED]"
          initial={false}
          animate={{ opacity: isDark ? 0 : 1 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        />
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-r from-[#020617] to-[#1E293B]"
          initial={false}
          animate={{ opacity: isDark ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        />
      </motion.div>

      {isDark ? (
        <>
          <motion.span
            className="pointer-events-none absolute left-2 top-1/2 h-0.5 w-0.5 rounded-full bg-white"
            animate={{ opacity: [0.4, 1, 0.4], y: [0, -1, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
            aria-hidden
          />
          <motion.span
            className="pointer-events-none absolute left-5 top-1.5 h-px w-px rounded-full bg-white/90"
            animate={{ opacity: [0.3, 0.95, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            aria-hidden
          />
          <motion.span
            className="pointer-events-none absolute right-4 top-2 h-0.5 w-0.5 rounded-full bg-white/80"
            animate={{ opacity: [0.5, 1, 0.5], y: [0, 1, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
            aria-hidden
          />
        </>
      ) : (
        <motion.div
          className="pointer-events-none absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-amber-400/25 blur-md"
          initial={false}
          animate={{ opacity: 0.85, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          aria-hidden
        />
      )}

      <motion.div
        className={cn(
          'relative z-[1] flex items-center justify-center rounded-full shadow-md',
          s.knob,
          isDark ? 'bg-[#0F172A]' : 'bg-white'
        )}
        initial={false}
        animate={{ x: isDark ? s.knobX : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{ willChange: 'transform' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? 'moon' : 'sun'}
            className="flex items-center justify-center"
            initial={{ rotate: -90, scale: 0.8, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          >
            {isDark ? (
              <Moon className={cn(s.icon, 'text-[#E2E8F0]')} strokeWidth={2.25} aria-hidden />
            ) : (
              <Sun className={cn(s.icon, 'text-[#F59E0B]')} strokeWidth={2.25} aria-hidden />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </motion.button>
  );
}

export const ThemeToggle = memo(ThemeToggleComponent);
