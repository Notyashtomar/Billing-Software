import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { UserFlags, UserPermissions } from '../../user/schema/user.schema';
import { UserPermissionsSchema } from '../../user/schema/user.schema';

export type AdminDocument = Admin & Document;

@Schema({ timestamps: true, collection: 'admin' })
export class Admin {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  userid: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  /** Legacy field — plaintext must never be stored. Prefer unset on write. */
  @Prop({ select: false })
  loginPassword?: string;

  @Prop({
    enum: ['superadmin', 'manager'],
    required: true,
  })
  role: string;

  // ── Profile fields (mirrors user schema for full edit-modal parity) ──────────

  @Prop()
  employeeId?: string;

  /** Sequential admin ID shared with panel users (100001, …). */
  @Prop({ unique: true, sparse: true, index: true })
  admNumber?: string;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  companyEmail?: string;

  @Prop()
  phone?: string;

  @Prop()
  gender?: string;

  @Prop()
  dob?: string;

  @Prop()
  residence?: string;

  @Prop()
  state?: string;

  @Prop()
  country?: string;

  @Prop()
  pincode?: string;

  @Prop()
  joiningDate?: string;

  @Prop()
  department?: string;

  @Prop()
  subDepartment?: string;

  @Prop()
  designation?: string;

  @Prop()
  company?: string;

  @Prop()
  station?: string;

  @Prop()
  locations?: string;

  @Prop({ default: 'Active' })
  status?: string;

  /** Station IDs this admin is assigned to (multi-station support). */
  @Prop({ type: [String], default: undefined })
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

  /** Per-station BWMS login-tile access. */
  @Prop({ type: Object, default: {} })
  stationAppAccess?: Record<string, string[]>;

  /** Per-station BWMS tool page grants (stationId → appId → page ids). */
  @Prop({ type: Object, default: {} })
  stationAppPageAccess?: Record<string, Record<string, string[]>>;

  // ── Station / access control ─────────────────────────────────────────────────

  /**
   * Multi-station: the admin's assigned station. Visibility is determined by
   * `stationCode` (NOT by `role`). Optional so existing rows remain valid until
   * the manual station-assignment step runs; a non-global admin without a
   * resolvable station fails closed at data-access time (never granted global).
   */
  @Prop()
  stationId?: string;

  /** Canonical clean station code (e.g. `AGR`) used for data segregation. */
  @Prop()
  stationCode?: string;

  /**
   * The ONLY flag that grants cross-station visibility. Independent of `role`.
   * `role === 'superadmin'` must NOT imply global access.
   */
  @Prop({ default: false })
  isGlobalAdmin?: boolean;

  /** FRIS module visibility derived from admin-panel permission toggles */
  @Prop({ type: Object })
  flags?: UserFlags;

  /** Raw tab + sub-page selections from admin panel */
  @Prop({ type: UserPermissionsSchema })
  permissions?: UserPermissions;

  /**
   * Admin-panel sections this admin may access. Each entry is an admin-panel
   * section key (e.g. `users`, `stations`). Absent = unrestricted (legacy).
   */
  @Prop({ type: [String], default: undefined })
  adminPanelSections?: string[];

  /** Bumped to invalidate all outstanding JWTs for this admin. */
  @Prop({ default: 0 })
  tokenVersion?: number;

  /** Optional TOTP secret (base32). When set with mfaEnabled, admin login requires MFA. */
  @Prop({ select: false })
  mfaSecret?: string;

  @Prop({ default: false })
  mfaEnabled?: boolean;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);

AdminSchema.pre('validate', function () {
  const role = String(this.role ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'operations') {
    this.role = 'manager';
  }
});

