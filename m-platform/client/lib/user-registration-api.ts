import { getApiBase } from '@/lib/api';

export type InvitePermissionPreset = {
  accessTabs: string[];
  accessSubPages: Record<string, string[]>;
};

export type AdminInviteWorkspaceMetric = {
  invitesOutstanding: number;
  pendingApprovals: number;
  activeUsers: number;
  /** Registrations rejected after submission (formerly inactive users). */
  removedPendingApprovals: number;
};

export type AdminInviteRecord = {
  id: string;
  inviteCode: string;
  name?: string;
  employeeId?: string;
  email: string;
  status: string;
  invitedRole: string;
  department?: string;
  company?: string;
  station?: string;
  sentCount: number;
  expiresAt: string;
  lastOpenedAt?: string;
  linkedUserId?: string;
  createdAt?: string;
  completionPercent: number;
  currentStepKey?: string;
  currentStepLabel?: string;
  registrationStepNumber?: number;
  registrationStepTotal?: number;
  inviteUrl: string;
};

export type AdminRegistrationUser = {
  id: string;
  userid: string;
  employeeId: string;
  admNumber?: string;
  name: string;
  email: string;
  companyEmail?: string;
  role: string;
  department?: string;
  subDepartment?: string;
  designation?: string;
  company?: string;
  station?: string;
  status?: string;
  accountStatus: string;
  approvalStatus: string;
  isActive: boolean;
  inviteId?: string;
  lastActivityAt?: string;
  createdAt?: string;
};

export type AdminActivityLog = {
  id: string;
  action: string;
  actorType: string;
  actorLabel?: string;
  inviteId?: string;
  userId?: string;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

export type UserRegistrationWorkspace = {
  metrics: AdminInviteWorkspaceMetric;
  invites: AdminInviteRecord[];
  users: AdminRegistrationUser[];
  pendingApprovals: AdminRegistrationUser[];
  removedPendingApprovals: AdminRegistrationUser[];
  activity: AdminActivityLog[];
};

export type TrainingEntry = {
  id: string;
  title: string;
};

export type PublicInviteDocument = {
  id: string;
  documentType: string;
  label: string;
  originalName: string;
  publicUrl: string;
  verificationStatus: string;
  updatedAt?: string;
};

export type PublicInviteVerification = {
  inviteId: string;
  inviteCode: string;
  email: string;
  status: string;
  expiresAt: string;
  invitedRole: string;
  department?: string;
  subDepartment?: string;
  designation?: string;
  company?: string;
  station?: string;
  completionPercent: number;
  documents: PublicInviteDocument[];
  permissionPreset: InvitePermissionPreset;
  draft: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    gender?: string;
    dob?: string;
    bloodGroup?: string;
    email?: string;
    nationality?: string;
    phone?: string;
    alternatePhone?: string;
    employeeId?: string;
    company?: string;
    station?: string;
    office?: string;
    department?: string;
    subDepartment?: string;
    designation?: string;
    joiningDate?: string;
    houseNo?: string;
    area?: string;
    landmark?: string;
    city?: string;
    residence?: string;
    state?: string;
    country?: string;
    pincode?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    aadharCardNo?: string;
    panCardNo?: string;
    trainingTitle?: string;
    trainings?: TrainingEntry[];
    completionPercent?: number;
    currentStepKey?: string;
  };
};

export type CreateInvitePayload = {
  email: string;
  invitedRole: 'employee';
  department?: string;
  subDepartment?: string;
  designation?: string;
  company?: string;
  station?: string;
  note?: string;
  expiresInHours?: number;
  permissionPreset?: InvitePermissionPreset;
};

export type InviteRegistrationPayload = {
  token: string;
  inviteId?: string;
  submissionMode: 'draft' | 'submit' | 'step';
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  bloodGroup?: string;
  email?: string;
  nationality?: string;
  phone?: string;
  alternatePhone?: string;
  employeeId?: string;
  company?: string;
  station?: string;
  office?: string;
  department?: string;
  subDepartment?: string;
  designation?: string;
  joiningDate?: string;
  houseNo?: string;
  area?: string;
  landmark?: string;
  city?: string;
  residence?: string;
  state?: string;
  country?: string;
  pincode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  aadharCardNo?: string;
  panCardNo?: string;
  trainingTitle?: string;
  trainings?: TrainingEntry[];
  registrationStepKey?: string;
};

export type InviteRegistrationFiles = Partial<Record<'profilePhoto', File>> &
  Record<string, File | undefined>;

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as {
    data?: T;
    message?: string | string[];
  };

  if (!res.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(', ')
      : data.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return (data.data ?? data) as T;
}

export async function fetchUserRegistrationWorkspace(): Promise<UserRegistrationWorkspace> {
  const res = await fetch(`${getApiBase()}/user-registration-workspace`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return parseJson<UserRegistrationWorkspace>(res);
}

export type ExportUserActivityLogRow = {
  logId: string;
  userId: string;
  employeeId: string;
  userName: string;
  userEmail: string;
  companyEmail: string;
  department: string;
  subDepartment: string;
  designation: string;
  company: string;
  station: string;
  accountStatus: string;
  approvalStatus: string;
  lastActivityAt: string;
  userCreatedAt: string;
  action: string;
  actorType: string;
  actorLabel: string;
  eventAt: string;
  metadata: string;
};

export async function fetchExportUserActivityLog(): Promise<ExportUserActivityLogRow[]> {
  const res = await fetch(`${getApiBase()}/export/user-activity-log`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await parseJson<ExportUserActivityLogRow[] | { data?: ExportUserActivityLogRow[] }>(
    res,
  );
  if (Array.isArray(data)) return data;
  return Array.isArray(data.data) ? data.data : [];
}

export type CreateUserInviteResult = {
  inviteId: string;
  inviteCode: string;
  email: string;
  expiresAt: string;
  inviteUrl: string;
  emailSent?: boolean;
  emailError?: string;
};

export type BulkCreateInvitePayload = Omit<CreateInvitePayload, 'email'> & {
  emails: string[];
};

export type BulkInviteResultRow = {
  email: string;
  success: boolean;
  inviteId?: string;
  inviteCode?: string;
  expiresAt?: string;
  inviteUrl?: string;
  emailSent?: boolean;
  emailError?: string;
  error?: string;
};

export type BulkCreateUserInvitesResult = {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkInviteResultRow[];
};

export async function createUserInvite(
  payload: CreateInvitePayload,
): Promise<CreateUserInviteResult> {
  const res = await fetch(`${getApiBase()}/invite-user`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<CreateUserInviteResult>(res);
}

export async function createUserInvitesBulk(
  payload: BulkCreateInvitePayload,
): Promise<BulkCreateUserInvitesResult> {
  const res = await fetch(`${getApiBase()}/bulk-invite-users`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<BulkCreateUserInvitesResult>(res);
}

export async function resendUserInvite(
  inviteId: string,
): Promise<{
  inviteId: string;
  email: string;
  expiresAt: string;
  inviteUrl: string;
  emailSent?: boolean;
  emailError?: string;
}> {
  const res = await fetch(`${getApiBase()}/resend-invite`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inviteId }),
  });
  return parseJson<{
    inviteId: string;
    email: string;
    expiresAt: string;
    inviteUrl: string;
    emailSent?: boolean;
    emailError?: string;
  }>(res);
}

export async function removeUserInvite(
  inviteId: string,
): Promise<{ inviteId: string; email: string; removed: boolean }> {
  const res = await fetch(`${getApiBase()}/remove-invite`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inviteId }),
  });
  return parseJson<{ inviteId: string; email: string; removed: boolean }>(res);
}

export async function approveRegisteredUser(
  userId: string,
  options?: { note?: string; sendCredentials?: boolean },
) {
  const res = await fetch(`${getApiBase()}/approve-user`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      note: options?.note,
      sendCredentials: options?.sendCredentials ?? false,
    }),
  });
  return parseJson<{
    userId: string;
    accountStatus: string;
    credentialsEmailSent?: boolean;
    credentialsEmailError?: string;
  }>(res);
}

export async function rejectRegisteredUser(userId: string, reason?: string) {
  const res = await fetch(`${getApiBase()}/reject-user`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, reason }),
  });
  return parseJson<{ userId: string; accountStatus: string }>(res);
}

export async function verifyUserInvite(
  token: string,
  inviteId?: string,
): Promise<PublicInviteVerification> {
  const params = inviteId?.trim()
    ? `?id=${encodeURIComponent(inviteId.trim())}`
    : '';
  const res = await fetch(
    `${getApiBase()}/verify-invite/${encodeURIComponent(token)}${params}`,
    {
      cache: 'no-store',
    },
  );
  return parseJson<PublicInviteVerification>(res);
}

export async function syncInviteRegistrationStep(payload: {
  token: string;
  inviteId?: string;
  registrationStepKey: string;
}): Promise<{ currentStepKey: string }> {
  const formData = new FormData();
  formData.append(
    'payload',
    JSON.stringify({
      ...payload,
      submissionMode: 'step',
    }),
  );

  const res = await fetch(`${getApiBase()}/register-user`, {
    method: 'POST',
    body: formData,
  });
  return parseJson<{ currentStepKey: string }>(res);
}

export async function submitInviteRegistration(
  payload: InviteRegistrationPayload,
  files: InviteRegistrationFiles = {},
): Promise<{
  invite?: PublicInviteVerification;
  completionPercent?: number;
  userId?: string;
  inviteId?: string;
}> {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));

  for (const [field, file] of Object.entries(files)) {
    if (file) {
      formData.append(field, file);
    }
  }

  const res = await fetch(`${getApiBase()}/register-user`, {
    method: 'POST',
    body: formData,
  });
  return parseJson<{
    invite?: PublicInviteVerification;
    completionPercent?: number;
    userId?: string;
    inviteId?: string;
  }>(res);
}
