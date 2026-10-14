'use client';

import { cn } from '@/lib/utils';

/** Reserved height under controls — keep in sync with GATEWAY_FORM_ACTIONS `pb-[1.125rem]`. */
export const FORM_FIELD_ERROR_SLOT_CLASS = 'mt-1 h-[1.125rem]';

type FormFieldErrorProps = {
  id?: string;
  message?: string | null;
  className?: string;
};

/**
 * Stable-height error slot under a form control.
 * Always reserves one line so multi-column grids stay aligned; long text truncates (full text in title).
 */
export function FormFieldError({ id, message, className }: FormFieldErrorProps) {
  const text = typeof message === 'string' ? message.trim() : '';
  return (
    <div className={cn(FORM_FIELD_ERROR_SLOT_CLASS, 'min-w-0', className)} aria-hidden={!text}>
      {text ? (
        <p
          id={id}
          role="alert"
          title={text}
          className="truncate text-xs leading-[1.125rem] text-red-600"
        >
          {text}
        </p>
      ) : (
        <span className="block h-full" />
      )}
    </div>
  );
}
