'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  ADVANCE_PATHS,
  advanceCreate,
  advanceDocId,
  advanceList,
  advanceUpdate,
  fetchCreationReferenceAirlines,
} from '@/lib/api';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { email, maxLength, minLength, required, validateFormValues, type FieldErrors } from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';

export type GatewayScheduledAirlineFormValues = {
  airlines: string;
  code: string;
  typeOfAirline: string;
  address: string;
  address2: string;
  reminderForInvoicing: string;
  agreementValidFrom: string;
  agreementValidTo: string;
  emailId: string;
  changeScheduledEnable: boolean;
  type: string;
  linkAircraftRegistrationWithType: boolean;
  engineerReport: boolean;
  deepCleaning: boolean;
  nightHaltCleaning: boolean;
  exteriorCleaning: boolean;
  dcsName: string;
  handlingType: string;
  wheelchairService: boolean;
};

export const EMPTY_GATEWAY_SCHEDULED_AIRLINE_FORM: GatewayScheduledAirlineFormValues = {
  airlines: '',
  code: '',
  typeOfAirline: 'Scheduled',
  address: '',
  address2: '',
  reminderForInvoicing: '',
  agreementValidFrom: '',
  agreementValidTo: '',
  emailId: '',
  changeScheduledEnable: false,
  type: 'Active',
  linkAircraftRegistrationWithType: false,
  engineerReport: true,
  deepCleaning: false,
  nightHaltCleaning: false,
  exteriorCleaning: false,
  dcsName: '',
  handlingType: 'Comprehensive Handling',
  wheelchairService: false,
};

const TYPE_OF_AIRLINE_OPTIONS = ['Scheduled', 'Non-Scheduled', 'Charter'];
const STATUS_OPTIONS = ['Active', 'Inactive'];
const HANDLING_TYPE_OPTIONS = [
  'Comprehensive Handling',
  'Ramp Handling',
  'Passenger Handling',
  'Cargo Handling',
];

const PATH = ADVANCE_PATHS.gatewayScheduledAirline;

const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-gray-700';
const INPUT_CLASS =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
const TEXTAREA_NO_RESIZE_CLASS = `${INPUT_CLASS} min-h-[88px] resize-none`;
const DROPDOWN_CLASS =
  'box-border h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const CHECKBOX_CLASS = 'h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500';
const HELPER_CLASS = 'mt-1 text-xs leading-snug text-gray-500';
const ADDRESS_MAX = 250;
const EMAIL_MAX = 500;
const REMINDER_MAX_DAYS = 365;

const FIELD_ORDER = [
  'airlines',
  'code',
  'reminderForInvoicing',
  'address',
  'address2',
  'emailId',
] as const;
type ScheduledAirlineField = (typeof FIELD_ORDER)[number];

function reminderDaysError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return 'Reminder must be a whole number of days.';
  const days = Number(v);
  if (days > REMINDER_MAX_DAYS) {
    return `Reminder must be ${REMINDER_MAX_DAYS} days or less.`;
  }
  return null;
}

function addressError(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return minLength(v, 5, label) ?? maxLength(v, ADDRESS_MAX, label);
}

function emailListError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const tooLong = maxLength(v, EMAIL_MAX, 'Email ID');
  if (tooLong) return tooLong;
  const parts = v.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return 'Enter a valid email.';
  for (const part of parts) {
    if (part.length > 254) return 'Each email must be at most 254 characters.';
    const invalid = email(part, 'email');
    if (invalid) return `${part} is not a valid email.`;
  }
  return null;
}

function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={LABEL_CLASS}>
      {children}
    </label>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-emerald-300 bg-gray-50/40 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function CheckboxCard({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div>
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
          checked
            ? 'border-emerald-300 bg-emerald-50/60'
            : 'border-gray-200 bg-white hover:bg-gray-50'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={`mt-0.5 ${CHECKBOX_CLASS}`}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-800">{label}</span>
          {description && (
            <span className="mt-0.5 block text-xs leading-snug text-gray-500">
              {description}
            </span>
          )}
        </span>
      </label>
      <FormFieldError />
    </div>
  );
}

export function docToGatewayScheduledAirlineForm(
  doc: Record<string, unknown>,
): GatewayScheduledAirlineFormValues {
  const d = advanceDocId(doc);
  return {
    airlines: String(d.airlines ?? ''),
    code: String(d.code ?? ''),
    typeOfAirline: String(d.typeOfAirline ?? 'Scheduled'),
    address: String(d.address ?? ''),
    address2: String(d.address2 ?? ''),
    reminderForInvoicing: String(d.reminderForInvoicing ?? ''),
    agreementValidFrom: String(d.agreementValidFrom ?? ''),
    agreementValidTo: String(d.agreementValidTo ?? ''),
    emailId: String(d.emailId ?? ''),
    changeScheduledEnable: Boolean(d.changeScheduledEnable),
    type: String(d.type ?? 'Active'),
    linkAircraftRegistrationWithType: Boolean(d.linkAircraftRegistrationWithType),
    engineerReport: d.engineerReport !== false,
    deepCleaning: Boolean(d.deepCleaning),
    nightHaltCleaning: Boolean(d.nightHaltCleaning),
    exteriorCleaning: Boolean(d.exteriorCleaning),
    dcsName: String(d.dcsName ?? ''),
    handlingType: String(d.handlingType ?? 'Comprehensive Handling'),
    wheelchairService: Boolean(d.wheelchairService),
  };
}

type Props = {
  onCancel: () => void;
  onSaved?: () => void | Promise<void>;
  editingId?: string | null;
  initialValues?: GatewayScheduledAirlineFormValues | null;
};

export default function ScheduledAirlineCreateForm({
  onCancel,
  onSaved,
  editingId = null,
  initialValues = null,
}: Props) {
  const [form, setForm] = useState<GatewayScheduledAirlineFormValues>(
    initialValues ?? EMPTY_GATEWAY_SCHEDULED_AIRLINE_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [dcsOptions, setDcsOptions] = useState<string[]>([]);
  const [airlineOptions, setAirlineOptions] = useState<
    { name: string; code: string }[]
  >([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<ScheduledAirlineField>(FIELD_ORDER);

  const loadDcsOptions = useCallback(async () => {
    try {
      const rows = (await advanceList(ADVANCE_PATHS.dcsMaster)) as Record<string, unknown>[];
      const names = Array.from(
        new Set(
          rows
            .map((r) => String(r.dcsName ?? '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));
      setDcsOptions(names);
    } catch {
      setDcsOptions([]);
    }
  }, []);

  const loadAirlines = useCallback(async () => {
    setAirlinesLoading(true);
    try {
      const list = (await fetchCreationReferenceAirlines()) as Record<string, unknown>[];
      const opts = list
        .map((doc) => {
          const d = advanceDocId(doc);
          return {
            name: String(d.name ?? '').trim(),
            code: String(d.code ?? '').trim(),
          };
        })
        .filter((row) => row.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setAirlineOptions(opts);
    } catch {
      setAirlineOptions([]);
    } finally {
      setAirlinesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDcsOptions();
    void loadAirlines();
  }, [loadAirlines, loadDcsOptions]);

  const airlineDropdownOptions = useMemo(() => {
    const opts = airlineOptions.map((row) => ({
      value: row.name,
      label: row.code ? `${row.name} (${row.code})` : row.name,
    }));
    const current = form.airlines.trim();
    if (current && !opts.some((opt) => opt.value === current)) {
      opts.unshift({ value: current, label: current });
    }
    return opts;
  }, [airlineOptions, form.airlines]);

  useEffect(() => {
    setForm(initialValues ?? EMPTY_GATEWAY_SCHEDULED_AIRLINE_FORM);
    clearAll();
  }, [clearAll, editingId, initialValues]);

  const setField = <K extends keyof GatewayScheduledAirlineFormValues>(
    key: K,
    value: GatewayScheduledAirlineFormValues[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'agreementValidFrom' && typeof value === 'string') {
        const from = parseIsoDate(value);
        const to = parseIsoDate(prev.agreementValidTo);
        if (!from || (to && to.getTime() < from.getTime())) {
          next.agreementValidTo = '';
        }
      }
      return next;
    });
    if (
      key === 'airlines' ||
      key === 'code' ||
      key === 'reminderForInvoicing' ||
      key === 'address' ||
      key === 'address2' ||
      key === 'emailId'
    ) {
      clearField(key);
    }
  };

  const agreementFrom = parseIsoDate(form.agreementValidFrom);

  const handleSave = async () => {
    const next: FieldErrors<ScheduledAirlineField> = {
      ...validateFormValues(
        { airlines: form.airlines, code: form.code },
        {
          airlines: { label: 'Airline name', required: true },
          code: { label: 'Code', required: true },
        },
      ),
    };
    const reminderMessage = reminderDaysError(form.reminderForInvoicing);
    const addressMessage = addressError(form.address, 'Address');
    const address2Message = addressError(form.address2, 'Address 2');
    const emailMessage = emailListError(form.emailId);
    if (reminderMessage) next.reminderForInvoicing = reminderMessage;
    if (addressMessage) next.address = addressMessage;
    if (address2Message) next.address2 = address2Message;
    if (emailMessage) next.emailId = emailMessage;
    if (applyAndFocus(next)) return;

    const body = {
      ...form,
      airlines: form.airlines.trim(),
      code: form.code.trim().toUpperCase(),
      reminderForInvoicing: form.reminderForInvoicing.trim(),
      address: form.address.trim(),
      address2: form.address2.trim(),
      emailId: form.emailId
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(', '),
    };

    setSaving(true);
    try {
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Scheduled airline updated successfully.');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Scheduled airline saved successfully.');
      }
      setForm(EMPTY_GATEWAY_SCHEDULED_AIRLINE_FORM);
      clearAll();
      await onSaved?.();
      onCancel();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save';
      setFieldError('airlines', message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 overflow-visible">
      <FormSection
        title="Airline Details"
        description="Core identification and agreement information for this airline."
      >
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="gw-airlines">Airlines</FieldLabel>
            <AdminRadioDropdown
              id="gw-airlines"
              value={form.airlines}
              onChange={(name) => {
                const selected = airlineOptions.find((row) => row.name === name);
                setField('airlines', name);
                if (selected?.code) setField('code', selected.code);
              }}
              options={airlineDropdownOptions}
              placeholder={airlinesLoading ? 'Loading airlines...' : 'Select airline'}
              disabled={airlinesLoading}
              searchPlaceholder="Search airline"
              aria-label="Airlines"
              aria-invalid={!!errors.airlines}
              aria-describedby={errors.airlines ? 'gw-airlines-error' : undefined}
              onBlur={() => setFieldError('airlines', required(form.airlines, 'Airline name'))}
              className={`${DROPDOWN_CLASS} ${errors.airlines ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
            />
            <FormFieldError id="gw-airlines-error" message={errors.airlines} />
          </div>
          <div>
            <FieldLabel htmlFor="gw-code">Code</FieldLabel>
            <input
              id="gw-code"
              name="code"
              type="text"
              value={form.code}
              onChange={(e) => setField('code', e.target.value)}
              onBlur={(e) => setFieldError('code', required(e.target.value, 'Code'))}
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? 'gw-code-error' : undefined}
              className={`${INPUT_CLASS} uppercase ${errors.code ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
              placeholder="e.g. 6E"
            />
            <FormFieldError id="gw-code-error" message={errors.code} />
          </div>
          <div>
            <FieldLabel>Type Of Airline</FieldLabel>
            <AdminRadioDropdown
              value={form.typeOfAirline}
              onChange={(v) => setField('typeOfAirline', v)}
              options={TYPE_OF_AIRLINE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
              className={DROPDOWN_CLASS}
            />
            <FormFieldError />
          </div>
          <div>
            <FieldLabel htmlFor="field-reminderForInvoicing">Reminder for Invoicing</FieldLabel>
            <input
              id="field-reminderForInvoicing"
              name="reminderForInvoicing"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={form.reminderForInvoicing}
              onChange={(e) =>
                setField(
                  'reminderForInvoicing',
                  e.target.value.replace(/\D/g, '').slice(0, 3),
                )
              }
              onBlur={() =>
                setFieldError(
                  'reminderForInvoicing',
                  reminderDaysError(form.reminderForInvoicing),
                )
              }
              aria-invalid={!!errors.reminderForInvoicing}
              aria-describedby={
                errors.reminderForInvoicing
                  ? 'field-reminderForInvoicing-error'
                  : 'field-reminderForInvoicing-hint'
              }
              className={`${INPUT_CLASS} ${errors.reminderForInvoicing ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
              placeholder="Days, e.g. 7"
            />
            <p id="field-reminderForInvoicing-hint" className={HELPER_CLASS}>
              Whole number of days, 0–{REMINDER_MAX_DAYS}.
            </p>
            <FormFieldError
              id="field-reminderForInvoicing-error"
              message={errors.reminderForInvoicing}
            />
          </div>
          <div>
            <FieldLabel>Status</FieldLabel>
            <AdminRadioDropdown
              value={form.type}
              onChange={(v) => setField('type', v)}
              options={STATUS_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
              className={DROPDOWN_CLASS}
            />
            <FormFieldError />
          </div>
          <div>
            <FieldLabel>Agreement Valid From</FieldLabel>
            <DatePicker
              value={form.agreementValidFrom}
              onChange={(v) => setField('agreementValidFrom', v)}
              valueFormat="yyyy-MM-dd"
              placeholder="Select start date"
              className="h-10 w-full text-sm"
            />
            <p className={HELPER_CLASS}>Choose the agreement start date first.</p>
            <FormFieldError />
          </div>
          <div>
            <FieldLabel>Agreement Valid To</FieldLabel>
            <DatePicker
              value={form.agreementValidTo}
              onChange={(v) => setField('agreementValidTo', v)}
              valueFormat="yyyy-MM-dd"
              placeholder={agreementFrom ? 'Select end date' : 'Select start date first'}
              disabled={!agreementFrom}
              minDate={agreementFrom}
              className="h-10 w-full text-sm"
            />
            <p className={HELPER_CLASS}>
              {agreementFrom
                ? 'End date must be on or after the start date.'
                : 'Available after a start date is selected.'}
            </p>
            <FormFieldError />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Address & Contact"
        description="Billing address and notification email recipients."
      >
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="field-address">Address</FieldLabel>
            <textarea
              id="field-address"
              name="address"
              value={form.address}
              maxLength={ADDRESS_MAX}
              onChange={(e) => setField('address', e.target.value.slice(0, ADDRESS_MAX))}
              onBlur={() => setFieldError('address', addressError(form.address, 'Address'))}
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? 'field-address-error' : 'field-address-hint'}
              className={`${TEXTAREA_NO_RESIZE_CLASS} ${errors.address ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
              placeholder="Address line"
            />
            <p id="field-address-hint" className={HELPER_CLASS}>
              {form.address.trim().length}/{ADDRESS_MAX} characters. Leave blank, or enter at least 5.
            </p>
            <FormFieldError id="field-address-error" message={errors.address} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="field-address2">Address 2</FieldLabel>
            <textarea
              id="field-address2"
              name="address2"
              value={form.address2}
              maxLength={ADDRESS_MAX}
              onChange={(e) => setField('address2', e.target.value.slice(0, ADDRESS_MAX))}
              onBlur={() => setFieldError('address2', addressError(form.address2, 'Address 2'))}
              aria-invalid={!!errors.address2}
              aria-describedby={errors.address2 ? 'field-address2-error' : 'field-address2-hint'}
              className={`${TEXTAREA_NO_RESIZE_CLASS} ${errors.address2 ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
              placeholder="Address line 2"
            />
            <p id="field-address2-hint" className={HELPER_CLASS}>
              {form.address2.trim().length}/{ADDRESS_MAX} characters. Leave blank, or enter at least 5.
            </p>
            <FormFieldError id="field-address2-error" message={errors.address2} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <FieldLabel htmlFor="field-emailId">Email ID</FieldLabel>
            <textarea
              id="field-emailId"
              name="emailId"
              value={form.emailId}
              maxLength={EMAIL_MAX}
              inputMode="email"
              autoComplete="email"
              onChange={(e) => setField('emailId', e.target.value.slice(0, EMAIL_MAX))}
              onBlur={() => setFieldError('emailId', emailListError(form.emailId))}
              aria-invalid={!!errors.emailId}
              aria-describedby={errors.emailId ? 'field-emailId-error' : 'field-emailId-hint'}
              className={`${TEXTAREA_NO_RESIZE_CLASS} ${errors.emailId ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
              placeholder="email1@example.com, email2@example.com"
            />
            <p id="field-emailId-hint" className={HELPER_CLASS}>
              Separate emails with commas. {form.emailId.trim().length}/{EMAIL_MAX} characters. Each address up to 254.
            </p>
            <FormFieldError id="field-emailId-error" message={errors.emailId} />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Handling & DCS"
        description="Departure control system and ground handling configuration."
      >
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel>DCS Name</FieldLabel>
            <AdminRadioDropdown
              value={form.dcsName}
              onChange={(v) => setField('dcsName', v)}
              options={[
                { value: '', label: dcsOptions.length ? 'Select DCS' : 'No DCS master records' },
                ...dcsOptions.map((name) => ({ value: name, label: name })),
              ]}
              className={DROPDOWN_CLASS}
            />
            <FormFieldError />
          </div>
          <div>
            <FieldLabel>Handling Type</FieldLabel>
            <AdminRadioDropdown
              value={form.handlingType}
              onChange={(v) => setField('handlingType', v)}
              options={HANDLING_TYPE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
              className={DROPDOWN_CLASS}
            />
            <FormFieldError />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Options & Services"
        description="Toggle the capabilities and services that apply to this airline."
      >
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CheckboxCard
            checked={form.changeScheduledEnable}
            onChange={(v) => setField('changeScheduledEnable', v)}
            label="Change Scheduled Enable"
            description="Enable real-time schedule changes on a per-flight basis."
          />
          <CheckboxCard
            checked={form.linkAircraftRegistrationWithType}
            onChange={(v) => setField('linkAircraftRegistrationWithType', v)}
            label="Link Registration with Type"
            description="Link aircraft registration number with aircraft type."
          />
          <CheckboxCard
            checked={form.engineerReport}
            onChange={(v) => setField('engineerReport', v)}
            label="Engineer Report"
            description="Capture engineer reports for this airline."
          />
          <CheckboxCard
            checked={form.wheelchairService}
            onChange={(v) => setField('wheelchairService', v)}
            label="Wheelchair Service"
            description="Wheelchair services handled by Ramp team."
          />
        </div>

        <div className="mt-4">
          <p className={`${LABEL_CLASS} mb-2`}>Cleaning Options</p>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['deepCleaning', 'Deep Cleaning'],
                ['nightHaltCleaning', 'Night Halt Cleaning'],
                ['exteriorCleaning', 'Exterior Cleaning'],
              ] as const
            ).map(([key, label]) => (
              <CheckboxCard
                key={key}
                checked={form[key]}
                onChange={(v) => setField(key, v)}
                label={label}
              />
            ))}
          </div>
        </div>
      </FormSection>

      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
        <motion.button
          type="button"
          onClick={onCancel}
          disabled={saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-4 py-2.5 rounded-xl font-medium text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </motion.button>
        <motion.button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-emerald-500 hover:bg-emerald-600 shadow-md shadow-emerald-500/25 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
        </motion.button>
      </div>
    </div>
  );
}
