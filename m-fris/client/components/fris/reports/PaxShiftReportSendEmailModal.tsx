'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BIRD_SHOOT_EMAIL_OPTIONS,
  emptyBirdShootEmailSelection,
} from '@/lib/birdShootEmailRecipients';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { email, FRIS_INVALID_CONTROL } from '@/lib/form-validation';
import { cn } from '@/lib/utils';

export type PaxShiftReportSendEmailModalProps = {
  open: boolean;
  busy: boolean;
  flightNo: string;
  serialLabel: string;
  onClose: () => void;
  onSend: (emails: string[]) => void | Promise<void>;
};

const EMAIL_FIELD_ORDER = ['customEmail'] as const;

export default function PaxShiftReportSendEmailModal({
  open,
  busy,
  flightNo,
  serialLabel,
  onClose,
  onSend,
}: PaxShiftReportSendEmailModalProps) {
  const [selection, setSelection] = useState<Record<string, boolean>>(emptyBirdShootEmailSelection);
  const [customEmail, setCustomEmail] = useState('');
  const { errors, clearField, clearAll, applyAndFocus } = useFieldErrors(EMAIL_FIELD_ORDER);

  useEffect(() => {
    if (!open) return;
    setCustomEmail('');
    setSelection(emptyBirdShootEmailSelection());
    clearAll();
  }, [open, clearAll]);

  if (!open) return null;

  const handleSend = () => {
    const emails: string[] = BIRD_SHOOT_EMAIL_OPTIONS.filter((addr) => selection[addr]);
    const custom = customEmail.trim().toLowerCase();
    if (custom) {
      const customErr = email(custom, 'Email');
      if (customErr) {
        applyAndFocus({ customEmail: customErr });
        return;
      }
      emails.push(custom);
    }
    const uniqueEmails = Array.from(new Set(emails));
    if (uniqueEmails.length === 0) {
      toast.error('Select at least one email.');
      return;
    }
    void onSend(uniqueEmails);
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900">Send Pax shift report email</h3>
        <p className="mt-2 text-sm text-gray-600">
          Flight <span className="font-medium">{flightNo || '—'}</span> · Serial{' '}
          <span className="font-medium">{serialLabel || '—'}</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          The report PDF will be attached to the email.
        </p>
        <div className="mt-4 space-y-2">
          {BIRD_SHOOT_EMAIL_OPTIONS.map((addr) => (
            <label
              key={addr}
              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={Boolean(selection[addr])}
                onChange={(e) =>
                  setSelection((prev) => ({
                    ...prev,
                    [addr]: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-gray-800">{addr}</span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-gray-600" htmlFor="field-customEmail">
            Add custom email (optional)
          </label>
          <input
            id="field-customEmail"
            type="email"
            value={customEmail}
            onChange={(e) => {
              setCustomEmail(e.target.value);
              clearField('customEmail');
            }}
            placeholder="name@example.com"
            className={cn(
              'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
              errors.customEmail && FRIS_INVALID_CONTROL,
            )}
            aria-invalid={!!errors.customEmail}
          />
          <FormFieldError id="field-customEmail-error" message={errors.customEmail} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
