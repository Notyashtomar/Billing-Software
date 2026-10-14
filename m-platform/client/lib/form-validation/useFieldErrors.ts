'use client';

import { useCallback, useState } from 'react';
import {
  focusFirstInvalidField,
  hasFieldErrors,
  type FieldErrors,
} from '@/lib/form-validation';

/**
 * Per-field error state for Gateway (and similar) forms.
 * Clears a field error as the user corrects input.
 */
export function useFieldErrors<K extends string>(fieldOrder: readonly K[]) {
  const [errors, setErrors] = useState<FieldErrors<K>>({});

  const clearAll = useCallback(() => setErrors({}), []);

  const clearField = useCallback((key: K) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setFieldError = useCallback((key: K, message: string | null) => {
    setErrors((prev) => {
      if (!message) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === message) return prev;
      return { ...prev, [key]: message };
    });
  }, []);

  const setAll = useCallback((next: FieldErrors<K>) => {
    setErrors(next);
  }, []);

  const applyAndFocus = useCallback(
    (next: FieldErrors<K>) => {
      setErrors(next);
      if (hasFieldErrors(next)) {
        // Defer focus until after paint so invalid borders exist.
        requestAnimationFrame(() => focusFirstInvalidField(fieldOrder, next));
      }
      return hasFieldErrors(next);
    },
    [fieldOrder],
  );

  return {
    errors,
    clearAll,
    clearField,
    setFieldError,
    setAll,
    applyAndFocus,
    hasErrors: hasFieldErrors(errors),
  };
}
