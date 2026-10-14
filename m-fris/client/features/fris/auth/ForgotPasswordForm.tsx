'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  email,
  minLength,
  runValidators,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { parseJsonText } from '@/lib/session-fetch';
import { getApiBase } from '@/services/api';
import {
  getClientPasswordPolicyMessages,
  PASSWORD_RESET_OTP_LENGTH,
  PASSWORD_RESET_RESEND_COOLDOWN_SEC,
} from './password-policy';

const PRIMARY_COLOR = '#10b981';
const BUTTON_COLOR = '#00ffb2';

const FIELD_ORDER = ['identifier', 'otp', 'newPassword', 'confirmPassword'] as const;
type ForgotField = (typeof FIELD_ORDER)[number];

type ForgotPasswordFormProps = {
  onBackToLogin: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

type ApiErrorBody = {
  message?: string | string[];
  error?: string;
};

type ResetStep = 'identifier' | 'otp' | 'password';

function extractApiMessage(data: ApiErrorBody, fallback: string): string {
  const raw = data.message ?? data.error;
  if (Array.isArray(raw) && raw.length > 0) {
    return String(raw[0]);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return fallback;
}

function looksLikeEmail(value: string): boolean {
  return value.includes('@');
}

function validateIdentifierValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Employee ID or email is required.';
  if (looksLikeEmail(trimmed)) {
    return runValidators(email(trimmed, 'Email'));
  }
  return runValidators(minLength(trimmed, 3, 'Employee ID'));
}

export default function ForgotPasswordForm({
  onBackToLogin,
  onError,
  onSuccess,
}: ForgotPasswordFormProps) {
  const [identifier, setIdentifier] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<ResetStep>('identifier');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const sendAbortRef = useRef<AbortController | null>(null);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef(false);
  const verifyInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const { errors, clearField, clearAll, applyAndFocus } =
    useFieldErrors<ForgotField>(FIELD_ORDER);

  const busy = sendingOtp || verifyingOtp || savingPassword;
  const trimmedIdentifier = identifier.trim();

  useEffect(() => {
    return () => {
      sendAbortRef.current?.abort();
      verifyAbortRef.current?.abort();
      saveAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === 'otp') {
      requestAnimationFrame(() => otpInputRef.current?.focus());
    } else if (step === 'password') {
      requestAnimationFrame(() => passwordInputRef.current?.focus());
    }
  }, [step]);

  const spacingClass = 'space-y-4 sm:space-y-5 md:space-y-6';

  const validatePasswordFields = (): FieldErrors<ForgotField> => {
    const next: FieldErrors<ForgotField> = {};
    if (!newPassword) {
      next.newPassword = 'New password is required.';
    } else {
      const policy = getClientPasswordPolicyMessages(newPassword);
      if (policy.length > 0) next.newPassword = policy[0] ?? 'Weak password.';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Confirm password is required.';
    } else if (newPassword && confirmPassword !== newPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }
    return next;
  };

  const postJson = async (
    path: string,
    body: Record<string, string>,
    signal: AbortSignal,
  ) => {
    const apiBase = getApiBase();
    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new Error('Something went wrong. Please try again later.');
    }

    let data: ApiErrorBody & { success?: boolean };
    try {
      const text = await response.text();
      const parsed = parseJsonText<typeof data>(text, null);
      if (parsed == null && text.trim()) {
        throw new SyntaxError('Invalid JSON body');
      }
      data = parsed ?? ({} as typeof data);
    } catch {
      throw new Error('Something went wrong. Please try again later.');
    }

    if (!response.ok || data.success === false) {
      throw new Error(
        extractApiMessage(data, 'Something went wrong. Please try again later.'),
      );
    }

    return data;
  };

  const handleSendOtp = async () => {
    if (sendInFlightRef.current || busy) return;
    const identifierErr = validateIdentifierValue(identifier);
    if (applyAndFocus(identifierErr ? { identifier: identifierErr } : {})) return;
    if (step !== 'identifier' && resendCooldown > 0) return;

    sendAbortRef.current?.abort();
    const controller = new AbortController();
    sendAbortRef.current = controller;
    sendInFlightRef.current = true;
    setSendingOtp(true);
    clearAll();

    try {
      const data = await postJson(
        '/auth/forgot-password/send-otp',
        {
          employeeId: trimmedIdentifier,
          accountScope: 'fris',
        },
        controller.signal,
      );
      setStep('otp');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setResendCooldown(PASSWORD_RESET_RESEND_COOLDOWN_SEC);
      onSuccess(
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'OTP has been sent to your registered email.',
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      sendInFlightRef.current = false;
      setSendingOtp(false);
      if (sendAbortRef.current === controller) {
        sendAbortRef.current = null;
      }
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (verifyInFlightRef.current || busy) return;
    if (step !== 'otp') return;

    const trimmedOtp = otp.trim();
    const otpErr = !/^\d{6}$/.test(trimmedOtp)
      ? `OTP must be a ${PASSWORD_RESET_OTP_LENGTH}-digit number.`
      : null;
    if (applyAndFocus(otpErr ? { otp: otpErr } : {})) return;

    verifyAbortRef.current?.abort();
    const controller = new AbortController();
    verifyAbortRef.current = controller;
    verifyInFlightRef.current = true;
    setVerifyingOtp(true);
    clearAll();

    try {
      const data = await postJson(
        '/auth/forgot-password/verify-otp',
        {
          employeeId: trimmedIdentifier,
          accountScope: 'fris',
          otp: trimmedOtp,
        },
        controller.signal,
      );
      setStep('password');
      onSuccess(
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'OTP verified. You can set a new password.',
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onError(err instanceof Error ? err.message : 'Failed to verify OTP.');
    } finally {
      verifyInFlightRef.current = false;
      setVerifyingOtp(false);
      if (verifyAbortRef.current === controller) {
        verifyAbortRef.current = null;
      }
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveInFlightRef.current || busy) return;
    if (step !== 'password') return;

    if (applyAndFocus(validatePasswordFields())) return;

    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;
    saveInFlightRef.current = true;
    setSavingPassword(true);
    clearAll();

    try {
      const data = await postJson(
        '/auth/forgot-password/verify-reset',
        {
          employeeId: trimmedIdentifier,
          accountScope: 'fris',
          newPassword,
          confirmPassword,
        },
        controller.signal,
      );
      onSuccess(
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'Password updated successfully. You can sign in with your new password.',
      );
      onBackToLogin();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onError(
        err instanceof Error ? err.message : 'Failed to reset password.',
      );
    } finally {
      saveInFlightRef.current = false;
      setSavingPassword(false);
      if (saveAbortRef.current === controller) {
        saveAbortRef.current = null;
      }
    }
  };

  const handlePrimarySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'identifier') {
      void handleSendOtp();
      return;
    }
    if (step === 'otp') {
      void handleVerifyOtp();
      return;
    }
    void handleSavePassword(e);
  };

  const fieldClass =
    'w-full rounded-xl border bg-black/50 px-4 py-3 text-base text-white placeholder-gray-400 transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none';
  const fieldStyle = (invalid?: boolean) =>
    ({
      borderColor: invalid ? undefined : `${PRIMARY_COLOR}40`,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    }) as const;

  const primaryButtonClass =
    'relative w-full rounded-xl px-6 py-3.5 text-base font-bold uppercase tracking-wider text-black transition-[filter,box-shadow,background-color] duration-200 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60';

  const stepNumber = step === 'identifier' ? 1 : step === 'otp' ? 2 : 3;
  const stepHint =
    step === 'identifier'
      ? 'Enter your employee ID or email'
      : step === 'otp'
        ? 'Enter the OTP from your email'
        : 'Choose a new password';

  return (
    <motion.form
      onSubmit={handlePrimarySubmit}
      className={spacingClass}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      noValidate
    >
      <div className="mb-1 text-center sm:mb-2">
        <h1
          className="text-2xl font-bold tracking-wide sm:text-3xl md:text-4xl"
          style={{ color: PRIMARY_COLOR }}
        >
          RESET PASSWORD
        </h1>
        <p className="mt-2 text-base text-gray-300 sm:text-lg">
          Step {stepNumber} of 3 · {stepHint}
        </p>
        <ol
          className="mt-3 flex items-center justify-center gap-2"
          aria-label={`Password reset progress, step ${stepNumber} of 3`}
        >
          {([1, 2, 3] as const).map((n) => (
            <li
              key={n}
              className={cn(
                'h-1.5 w-8 rounded-full transition-colors',
                n <= stepNumber ? 'bg-emerald-400' : 'bg-white/20',
              )}
              aria-current={n === stepNumber ? 'step' : undefined}
            />
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="field-identifier"
          className="flex items-center gap-2 text-base font-semibold text-white"
        >
          <Mail className="h-5 w-5 shrink-0" aria-hidden />
          <span>EMPLOYEE ID OR EMAIL</span>
          <span className="ml-auto text-xs font-medium" style={{ color: PRIMARY_COLOR }}>
            REQUIRED
          </span>
        </label>
        <input
          id="field-identifier"
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            clearField('identifier');
            if (step !== 'identifier') {
              setStep('identifier');
              setOtp('');
              setNewPassword('');
              setConfirmPassword('');
              setResendCooldown(0);
              clearAll();
            }
          }}
          disabled={busy}
          aria-required="true"
          aria-invalid={!!errors.identifier}
          aria-describedby={errors.identifier ? 'field-identifier-error' : undefined}
          className={cn(fieldClass, errors.identifier && FRIS_INVALID_CONTROL)}
          style={fieldStyle(!!errors.identifier)}
          placeholder="Enter employee ID or email"
        />
        <FormFieldError id="field-identifier-error" message={errors.identifier} />
      </div>

      {step === 'identifier' ? (
        <button
          type="submit"
          disabled={busy}
          aria-busy={sendingOtp}
          className={primaryButtonClass}
          style={{ backgroundColor: BUTTON_COLOR }}
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            {sendingOtp ? (
              <>
                <motion.div
                  className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <span>SENDING OTP...</span>
              </>
            ) : (
              <>
                <KeyRound className="h-5 w-5" />
                <span>SEND OTP</span>
              </>
            )}
          </span>
        </button>
      ) : null}

      <AnimatePresence initial={false}>
        {step === 'otp' || step === 'password' ? (
          <motion.div
            key="otp-step"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            <div className="space-y-2">
              <label
                htmlFor="field-otp"
                className="flex items-center gap-2 text-base font-semibold text-white"
              >
                <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
                <span>OTP</span>
                <span
                  className="ml-auto text-xs font-medium"
                  style={{ color: PRIMARY_COLOR }}
                >
                  {PASSWORD_RESET_OTP_LENGTH} DIGITS
                </span>
              </label>
              <input
                ref={otpInputRef}
                id="field-otp"
                name="otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={PASSWORD_RESET_OTP_LENGTH}
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => {
                  setOtp(
                    e.target.value
                      .replace(/\D/g, '')
                      .slice(0, PASSWORD_RESET_OTP_LENGTH),
                  );
                  clearField('otp');
                }}
                className={cn(fieldClass, errors.otp && FRIS_INVALID_CONTROL)}
                style={fieldStyle(!!errors.otp)}
                placeholder="Enter OTP from email"
                disabled={busy || step === 'password'}
                aria-invalid={!!errors.otp}
                aria-describedby={errors.otp ? 'field-otp-error' : undefined}
              />
              <FormFieldError id="field-otp-error" message={errors.otp} />
            </div>

            {step === 'otp' ? (
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={verifyingOtp}
                  className={primaryButtonClass}
                  style={{ backgroundColor: BUTTON_COLOR }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-3">
                    {verifyingOtp ? (
                      <>
                        <motion.div
                          className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black"
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: 'linear',
                          }}
                        />
                        <span>VERIFYING OTP...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5" />
                        <span>VERIFY OTP</span>
                      </>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleSendOtp()}
                  disabled={busy || resendCooldown > 0}
                  aria-busy={sendingOtp}
                  className="inline-flex w-full items-center justify-center gap-2 text-sm font-medium underline-offset-2 hover:underline disabled:opacity-60"
                  style={{ color: PRIMARY_COLOR }}
                >
                  {sendingOtp
                    ? 'Sending...'
                    : resendCooldown > 0
                      ? `Resend OTP in ${resendCooldown}s`
                      : 'Resend OTP'}
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {step === 'password' ? (
          <motion.div
            key="password-step"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            <div className="space-y-2">
              <label
                htmlFor="field-newPassword"
                className="flex items-center gap-2 text-base font-semibold text-white"
              >
                <Lock className="h-5 w-5 shrink-0" aria-hidden />
                <span>NEW PASSWORD</span>
              </label>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  id="field-newPassword"
                  name="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    clearField('newPassword');
                  }}
                  className={cn(
                    fieldClass,
                    'pr-14',
                    errors.newPassword && FRIS_INVALID_CONTROL,
                  )}
                  style={fieldStyle(!!errors.newPassword)}
                  placeholder="Enter new password"
                  disabled={busy}
                  aria-invalid={!!errors.newPassword}
                  aria-describedby={
                    errors.newPassword ? 'field-newPassword-error' : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 opacity-90 transition-opacity hover:opacity-100"
                  style={{ color: PRIMARY_COLOR }}
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              <FormFieldError id="field-newPassword-error" message={errors.newPassword} />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="field-confirmPassword"
                className="flex items-center gap-2 text-base font-semibold text-white"
              >
                <Lock className="h-5 w-5 shrink-0" aria-hidden />
                <span>CONFIRM PASSWORD</span>
              </label>
              <div className="relative">
                <input
                  id="field-confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearField('confirmPassword');
                  }}
                  className={cn(
                    fieldClass,
                    'pr-14',
                    errors.confirmPassword && FRIS_INVALID_CONTROL,
                  )}
                  style={fieldStyle(!!errors.confirmPassword)}
                  placeholder="Confirm new password"
                  disabled={busy}
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={
                    errors.confirmPassword ? 'field-confirmPassword-error' : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 opacity-90 transition-opacity hover:opacity-100"
                  style={{ color: PRIMARY_COLOR }}
                  aria-label={
                    showConfirmPassword
                      ? 'Hide confirm password'
                      : 'Show confirm password'
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              <FormFieldError
                id="field-confirmPassword-error"
                message={errors.confirmPassword}
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              aria-busy={savingPassword}
              className={primaryButtonClass}
              style={{ backgroundColor: BUTTON_COLOR }}
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                {savingPassword ? (
                  <>
                    <motion.div
                      className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                    <span>SAVING PASSWORD...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-5 w-5" />
                    <span>SAVE NEW PASSWORD</span>
                  </>
                )}
              </span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={onBackToLogin}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 pt-1 text-base underline-offset-2 hover:underline disabled:opacity-60"
        style={{ color: PRIMARY_COLOR }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        <span>Back to Login</span>
      </button>
    </motion.form>
  );
}
