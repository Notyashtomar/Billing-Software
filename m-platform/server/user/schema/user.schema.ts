import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

/** Department: single key = main dept, value = subdepartment e.g. { operations: 'ramp' } */
export type UserDepartment = Record<string, string>;

/** Flags: named keys, values 0|1 or nested object with string keys and 0|1 */
export type UserFlags = Record<string, number | Record<string, number>>;

@Schema({ _id: false })
export class UserPermissions {
  @Prop({ type: [String], default: [] })
  accessTabs: string[];

  @Prop({ type: Object, default: {} })
  accessSubPages: Record<string, string[]>;
}

export const UserPermissionsSchema = SchemaFactory.createForClass(UserPermissions);

@Schema({ _id: false })
export class UserRegistrationTraining {
  @Prop({ required: true })
  id: string;

  @Prop()
  title?: string;
}

export const UserRegistrationTrainingSchema =
  SchemaFactory.createForClass(UserRegistrationTraining);

@Schema({ _id: false })
export class UserRegistrationDraft {
  @Prop()
  firstName?: string;

  @Prop()
  middleName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  gender?: string;

  @Prop()
  dob?: string;

  @Prop()
  bloodGroup?: string;

  @Prop()
  email?: string;

  @Prop()
  nationality?: string;

  @Prop()
  phone?: string;

  @Prop()
  alternatePhone?: string;

  @Prop()
  employeeId?: string;

  @Prop()
  company?: string;

  @Prop()
  station?: string;

  @Prop()
  office?: string;

  @Prop()
  department?: string;

  @Prop()
  subDepartment?: string;

  @Prop()
  designation?: string;

  @Prop()
  joiningDate?: string;

  @Prop()
  houseNo?: string;

  @Prop()
  area?: string;

  @Prop()
  landmark?: string;

  @Prop()
  city?: string;

  @Prop()
  residence?: string;

  @Prop()
  state?: string;

  @Prop()
  country?: string;

  @Prop()
  pincode?: string;

  @Prop()
  emergencyContactName?: string;

  @Prop()
  emergencyContactPhone?: string;

  @Prop()
  aadharCardNo?: string;

  @Prop()
  panCardNo?: string;

  @Prop()
  trainingTitle?: string;

  @Prop({ type: [UserRegistrationTrainingSchema], default: [] })
  trainings?: UserRegistrationTraining[];

  @Prop({ default: 0 })
  completionPercent?: number;

  /** Last registration wizard page the invitee was on (personal | address | documents). */
  @Prop()
  currentStepKey?: string;
}

export const UserRegistrationDraftSchema =
  SchemaFactory.createForClass(UserRegistrationDraft);

@Schema({ timestamps: true })
export class UserRegistrationDocument {
  @Prop({ required: true })
  documentType: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  storedName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ default: 'uploaded' })
  verificationStatus: string;
}

export const UserRegistrationDocumentSchema = SchemaFactory.createForClass(
  UserRegistrationDocument,
);

@Schema({ timestamps: true })
export class UserRegistrationActivityEntry {
  @Prop({ required: true })
  action: string;

  @Prop({ default: 'admin' })
  actorType: string;

  @Prop()
  actorLabel?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;
}

export const UserRegistrationActivityEntrySchema = SchemaFactory.createForClass(
  UserRegistrationActivityEntry,
);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  userid: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  companyEmail?: string;

  @Prop({ required: true })
  password: string;

  /** Legacy field — plaintext must never be stored. Prefer unset on write. */
  @Prop({ select: false })
  loginPassword?: string;

  @Prop({ required: true })
  role: string;

  /** Panel authorization: superadmin, manager, or employee. */
  @Prop({ default: 'employee' })
  authorizationRole?: string;

  @Prop()
  employeeId?: string;

  /** Sequential admin ID for users created via the admin Users page (100001, …). */
  @Prop({ unique: true, sparse: true, index: true })
  admNumber?: string;

  /** True when the account was created through admin panel Add User (not invite onboarding). */
  @Prop({ default: false })
  createdViaPanel?: boolean;

  @Prop()
  firstName?: string;

  @Prop()
  middleName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  gender?: string;

  @Prop()
  dob?: string;

  @Prop()
  bloodGroup?: string;

  @Prop()
  nationality?: string;

  @Prop()
  fatherName?: string;

  @Prop()
  motherName?: string;

  @Prop()
  phone?: string;

  @Prop()
  alternatePhone?: string;

  @Prop()
  houseNo?: string;

  @Prop()
  area?: string;

  @Prop()
  landmark?: string;

  @Prop()
  city?: string;

  @Prop()
  residence?: string;

  @Prop()
  state?: string;

  @Prop()
  country?: string;

  @Prop()
  pincode?: string;

  @Prop()
  emergencyContactName?: string;

  @Prop()
  emergencyContactPhone?: string;

  @Prop()
  aadharCardNo?: string;

  @Prop()
  panCardNo?: string;

  @Prop()
  trainingTitle?: string;

  @Prop({ type: [UserRegistrationTrainingSchema], default: [] })
  trainings?: UserRegistrationTraining[];

  @Prop()
  joiningDate?: string;

  @Prop()
  designation?: string;

  @Prop()
  company?: string;

  @Prop()
  station?: string;

  /** Admin-station document ids this user is assigned to. */
  @Prop({ type: [String], default: [] })
  assignedStationIds?: string[];

  /** Per-station FRIS permissions keyed by admin-station id. */
  @Prop({ type: Object, default: {} })
  stationPermissions?: Record<
    string,
    {
      accessTabs: string[];
      accessSubPages: Record<string, string[]>;
    }
  >;

  /** Per-station BWMS login-tile access (app ids from BWMS_APP_TOOLS). */
  @Prop({ type: Object, default: {} })
  stationAppAccess?: Record<string, string[]>;

  /**
   * Per-station BWMS tool page grants: stationId → appId → page ids.
   * Missing app key while tile is on = grandfather all catalog pages for that app.
   */
  @Prop({ type: Object, default: {} })
  stationAppPageAccess?: Record<string, Record<string, string[]>>;

  @Prop()
  locations?: string;

  @Prop({ default: 'Active' })
  status?: string;

  /** @deprecated Legacy invite pointer — invite data now lives on the same user document */
  @Prop()
  inviteId?: string;

  @Prop({ default: true })
  isActive?: boolean;

  @Prop({ default: 'active' })
  accountStatus?: string;

  @Prop({ default: 'approved' })
  approvalStatus?: string;

  @Prop({ default: 'approved' })
  registrationStatus?: string;

  @Prop()
  approvedAt?: Date;

  @Prop()
  approvedByAdminId?: string;

  @Prop()
  rejectedAt?: Date;

  @Prop()
  rejectedByAdminId?: string;

  @Prop()
  rejectionReason?: string;

  @Prop()
  lastActivityAt?: Date;

  /** Last time superadmins were emailed because this approval stayed pending > 24h. */
  @Prop()
  staleApprovalAlertSentAt?: Date;

  /** Display label from admin form (e.g. "Technology") */
  @Prop()
  departmentLabel?: string;

  @Prop()
  subDepartment?: string;

  /** Main department key → sub-department value (auth / legacy) */
  @Prop({ type: Object, required: true })
  department: UserDepartment;

  /** Module visibility flags derived from permissions (auth / FRIS UI) */
  @Prop({ type: Object, required: true })
  flags: UserFlags;

  /** Raw tab + sub-page selections from admin panel */
  @Prop({ type: UserPermissionsSchema, required: true })
  permissions: UserPermissions;

  /**
   * Admin-panel sections this account may access (only meaningful for
   * admin/superadmin authorization roles). Each entry is an admin-panel section
   * key (e.g. `users`, `stations`). Absent = unrestricted (legacy accounts).
   */
  @Prop({ type: [String], default: undefined })
  adminPanelSections?: string[];

  /** Invite onboarding token (unique while invite is active) */
  @Prop({ unique: true, sparse: true, index: true })
  inviteToken?: string;

  @Prop({ unique: true, sparse: true })
  inviteCode?: string;

  @Prop({
    enum: [
      'sent',
      'opened',
      'draft',
      'submitted',
      'approved',
      'rejected',
      'expired',
      'revoked',
    ],
  })
  inviteStatus?: string;

  @Prop()
  inviteExpiresAt?: Date;

  @Prop({ default: 0 })
  inviteSentCount?: number;

  @Prop()
  inviteLastOpenedAt?: Date;

  @Prop()
  inviteNote?: string;

  @Prop()
  inviteCreatedByAdminId?: string;

  @Prop()
  inviteCreatedByAdminName?: string;

  @Prop({ type: UserRegistrationDraftSchema, default: () => ({}) })
  registrationDraft?: UserRegistrationDraft;

  @Prop({ type: [UserRegistrationDocumentSchema], default: [] })
  registrationDocuments?: Types.DocumentArray<UserRegistrationDocument>;

  @Prop({ type: [UserRegistrationActivityEntrySchema], default: [] })
  registrationActivity?: Types.DocumentArray<UserRegistrationActivityEntry>;

  /** Bumped to invalidate all outstanding JWTs for this user. */
  @Prop({ default: 0 })
  tokenVersion?: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ authorizationRole: 1, accountStatus: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ station: 1 });
UserSchema.index({ departmentLabel: 1 });
UserSchema.index({ employeeId: 1 });
UserSchema.index({ name: 1 });
UserSchema.index({ assignedStationIds: 1 });
