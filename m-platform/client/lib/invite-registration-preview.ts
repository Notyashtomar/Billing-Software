import type { PublicInviteVerification } from '@/lib/user-registration-api';

/** Mock invite used by /register/preview for local UI development. */
export const PREVIEW_INVITE: PublicInviteVerification = {
  inviteId: 'preview-dev',
  inviteCode: 'PREVIEW',
  email: 'preview@example.com',
  status: 'opened',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  invitedRole: 'employee',
  department: 'Operations',
  subDepartment: 'Ramp',
  designation: 'Operator - I',
  company: 'Bird Airport Services (Konkan) Pvt. Ltd.',
  station: 'Goa Airport',
  completionPercent: 0,
  documents: [],
  permissionPreset: {
    accessTabs: [],
    accessSubPages: {},
  },
  draft: {},
};
