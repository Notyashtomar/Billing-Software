'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { billingUi } from '../billingUi';

export function FieldGroup({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className={billingUi.label}>
        {label}
      </label>
      {children}
      {hint ? <p className={billingUi.hint}>{hint}</p> : null}
    </div>
  );
}

const inputClass = billingUi.input;

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  min,
  step,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: InputHTMLAttributes<HTMLInputElement>['type'];
  required?: boolean;
  min?: number | string;
  step?: number | string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      required={required}
      min={min}
      step={step}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}
