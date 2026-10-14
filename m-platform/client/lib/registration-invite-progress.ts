import type { AdminInviteRecord } from '@/lib/user-registration-api';

const REGISTRATION_STEP_LABELS: Record<string, string> = {
  personal: 'Personal',
  address: 'Address',
  documents: 'Documents',
};

export function resolveInviteStepLabel(invite: AdminInviteRecord): string {
  if (invite.currentStepLabel?.trim()) {
    return invite.currentStepLabel.trim();
  }
  const key = invite.currentStepKey?.trim().toLowerCase() ?? '';
  if (key === 'not_started') return 'Not started';
  if (key === 'complete') return 'Submitted';
  if (REGISTRATION_STEP_LABELS[key]) return REGISTRATION_STEP_LABELS[key];
  if (invite.registrationStepNumber && invite.registrationStepNumber > 0) {
    const inferred =
      ['personal', 'address', 'documents'][invite.registrationStepNumber - 1];
    if (inferred && REGISTRATION_STEP_LABELS[inferred]) {
      return REGISTRATION_STEP_LABELS[inferred];
    }
  }
  if (!invite.lastOpenedAt) return 'Not started';
  if (invite.completionPercent >= 85) return 'Documents';
  if (invite.completionPercent >= 50) return 'Address';
  return 'Personal';
}

export function resolveInviteStepNumber(invite: AdminInviteRecord): number {
  if (invite.registrationStepNumber && invite.registrationStepNumber > 0) {
    return invite.registrationStepNumber;
  }
  const key = invite.currentStepKey?.trim().toLowerCase() ?? '';
  if (key === 'personal') return 1;
  if (key === 'address') return 2;
  if (key === 'documents') return 3;
  if (key === 'complete') return 3;
  return 0;
}

export function resolveInviteStepTotal(invite: AdminInviteRecord): number {
  return invite.registrationStepTotal ?? 3;
}

export function formatInviteFormsFilled(invite: AdminInviteRecord): string {
  const total = resolveInviteStepTotal(invite);
  const stepKey = invite.currentStepKey?.trim().toLowerCase() ?? '';
  if (stepKey === 'complete') {
    return `${total}/${total}`;
  }
  const stepNumber = resolveInviteStepNumber(invite);
  if (stepNumber <= 0) {
    return `0/${total}`;
  }
  return `${stepNumber}/${total}`;
}

export function clampInviteCompletionPercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function displayInviteCompletionPercent(invite: AdminInviteRecord): number {
  const key = invite.currentStepKey?.trim().toLowerCase() ?? '';
  if (key === 'complete') return 100;
  return clampInviteCompletionPercent(invite.completionPercent);
}

export function inviteDisplayName(invite: Pick<AdminInviteRecord, 'name'>): string {
  return String(invite.name ?? '').trim();
}

export function inviteEmployeeCode(
  invite: Pick<AdminInviteRecord, 'employeeId'>,
): string {
  return String(invite.employeeId ?? '').trim().toUpperCase();
}

export function inviteProgressExportFields(invite: AdminInviteRecord) {
  return {
    currentStep: resolveInviteStepLabel(invite),
    formsFilled: formatInviteFormsFilled(invite),
    completionPercent: displayInviteCompletionPercent(invite),
    stepKey: invite.currentStepKey?.trim() ?? '',
    stepNumber: resolveInviteStepNumber(invite),
    stepTotal: resolveInviteStepTotal(invite),
  };
}
