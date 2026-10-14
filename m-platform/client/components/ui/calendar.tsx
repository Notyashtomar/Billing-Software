'use client';

import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * react-day-picker v9: keep default `rdp-*` classes from getDefaultClassNames()
 * so table/grid layout works. Global `react-day-picker/style.css` is required.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  navLayout = 'around',
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      className={cn('p-3', className)}
      classNames={{
        ...defaults,
        root: cn(defaults.root, 'w-fit border-0 bg-transparent p-0 shadow-none'),
        months: cn(defaults.months, 'flex flex-col gap-4'),
        month: cn(defaults.month, 'flex w-full flex-col gap-3'),
        month_caption: cn(defaults.month_caption, 'text-emerald-950'),
        caption_label: cn(defaults.caption_label, 'text-sm font-semibold'),
        button_previous: cn(
          defaults.button_previous,
          buttonVariants({ variant: 'outline' }),
          'h-8 w-8 shrink-0 border-emerald-200 bg-white p-0 text-emerald-700 opacity-100 hover:bg-emerald-50 hover:opacity-100'
        ),
        button_next: cn(
          defaults.button_next,
          buttonVariants({ variant: 'outline' }),
          'h-8 w-8 shrink-0 border-emerald-200 bg-white p-0 text-emerald-700 opacity-100 hover:bg-emerald-50 hover:opacity-100'
        ),
        month_grid: cn(defaults.month_grid, 'w-full border-collapse'),
        weekdays: cn(defaults.weekdays),
        weekday: cn(defaults.weekday, 'text-emerald-600/90'),
        weeks: cn(defaults.weeks),
        week: cn(defaults.week),
        day: cn(defaults.day, 'p-0 text-center'),
        day_button: cn(
          defaults.day_button,
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 rounded-lg p-0 font-normal text-emerald-950 aria-selected:opacity-100'
        ),
        selected: cn(defaults.selected, 'rounded-lg'),
        outside: cn(defaults.outside, 'text-emerald-700/45'),
        disabled: cn(defaults.disabled, 'opacity-40'),
        today: cn(defaults.today, 'rounded-lg bg-emerald-100/90 text-emerald-900'),
        chevron: cn(defaults.chevron, 'fill-emerald-600'),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chClassName, orientation }) => {
          const cls = cn('h-4 w-4 text-emerald-700', chClassName);
          if (orientation === 'left') return <ChevronLeft className={cls} aria-hidden />;
          if (orientation === 'right') return <ChevronRight className={cls} aria-hidden />;
          return <ChevronDown className={cls} aria-hidden />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
