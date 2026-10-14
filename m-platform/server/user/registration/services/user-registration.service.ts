import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  User,
  UserDocument,
  UserRegistrationActivityEntry,
  UserRegistrationDocument,
} from '../../schema/user.schema';
import {
  buildDepartmentRecord,
  buildFlagsFromPermissions,
  normalizeAccessSubPages,
} from '../../utils/permissions-to-flags';
import {
  ApproveRegisteredUserDto,
  BulkCreateUserInvitesDto,
  CreateUserInviteDto,
  RejectRegisteredUserDto,
  RemoveUserInviteDto,
  ResendUserInviteDto,
} from '../dto/user-registration.dto';
import { UserInviteMailerService } from './user-invite-mailer.service';
import { PendingApprovalAlertService } from './pending-approval-alert.service';
import { UserService } from '../../services/user.service';
import { emitAdminNotification } from '../../../admin-notifications/utils/emit-admin-notification.util';
import { USER_ACTIVITY_LOG_EVENT } from '../../../user-activity-notifications/events/user-activity.events';
import { nextTokenVersion } from '../../../auth/utils/token-version.util';
import { FileStorageService } from '../../../common/storage/file-storage.service';
import {
  AdminStation,
  AdminStationDocument,
} from '../../../admin-stations/schema/admin-station.schema';
import type { AuthenticatedPrincipal } from '../../../auth/services/identity.service';
import {
  formatAdminStationLabel,
  inviteUserHasNoStationBinding,
  userBelongsToAdminPanelStationScope,
} from '../../../common/station/admin-panel-station-scope';
import { AdminPanelStationScopeService } from '../../../common/station/admin-panel-station-scope.service';
import { generateTemporaryLoginPassword } from '../../../common/validators/password-policy';
import { encryptPassword } from '../../../common/security/password-vault.util';

type RegisterPayload = {
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
  trainings?: Array<{ id: string; title?: string }>;
  registrationStepKey?: string;
};

const REGISTRATION_STEP_KEYS = ['personal', 'address', 'documents'] as const;
type RegistrationStepKey = (typeof REGISTRATION_STEP_KEYS)[number];

const REGISTRATION_STEP_LABELS: Record<RegistrationStepKey, string> = {
  personal: 'Personal',
  address: 'Address',
  documents: 'Documents',
};

const DOCUMENT_LABELS: Record<string, string> = {
  profilePhoto: 'Profile photo',
  trainingCertification: 'Training certification',
};

const TRAINING_CERT_PREFIX = 'trainingCertification:';
const TRAINING_CERT_FILE_PREFIX = 'trainingCertification_';

const ACTIVE_INVITE_STATUSES = ['sent', 'opened', 'draft'] as const;
const REMOVABLE_INVITE_STATUSES = [
  'sent',
  'opened',
  'draft',
  'expired',
  'revoked',
] as const;

@Injectable()
export class UserRegistrationService {
  private readonly uploadRoot = 'user-invite-docs';

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(AdminStation.name)
    private readonly stationModel: Model<AdminStationDocument>,
    private readonly mailer: UserInviteMailerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly fileStorage: FileStorageService,
    private readonly adminPanelStationScope: AdminPanelStationScopeService,
    private readonly userService: UserService,
    private readonly pendingApprovalAlert: PendingApprovalAlertService,
  ) {}

  private getFrontendBaseUrl(): string {
    return (
      process.env.FRONTEND_URL ||
      process.env.CLIENT_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private buildInviteUrl(token: string, inviteId?: string): string {
    const base = `${this.getFrontendBaseUrl()}/register/invite/${token}`;
    const id = inviteId?.trim();
    if (!id) return base;
    return `${base}?id=${encodeURIComponent(id)}`;
  }

  private normalizeInviteToken(raw: string): string {
    try {
      return decodeURIComponent(String(raw ?? '').trim());
    } catch {
      return String(raw ?? '').trim();
    }
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateInviteCode(): string {
    return `INV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private joinPersonName(
    firstName?: string,
    middleName?: string,
    lastName?: string,
  ): string {
    return [firstName, middleName, lastName]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join(' ');
  }

  private resolveInviteeIdentity(
    user: Pick<
      User,
      'name' | 'firstName' | 'middleName' | 'lastName' | 'employeeId' | 'userid'
    >,
    draft: RegisterPayload,
  ): { name: string; employeeId: string } {
    const storedName = String(user.name ?? '').trim();
    const name =
      this.joinPersonName(draft.firstName, draft.middleName, draft.lastName) ||
      this.joinPersonName(user.firstName, user.middleName, user.lastName) ||
      (storedName && !/^invite:/i.test(storedName) ? storedName : '');

    const draftedId = String(draft.employeeId ?? '').trim().toUpperCase();
    const storedId = String(user.employeeId ?? '').trim().toUpperCase();
    const userid = String(user.userid ?? '').trim().toUpperCase();
    const employeePattern = /^[A-Z0-9]{1,16}$/;
    const employeeId =
      (employeePattern.test(storedId) && storedId) ||
      (employeePattern.test(draftedId) && draftedId) ||
      (employeePattern.test(userid) && userid) ||
      storedId ||
      draftedId ||
      '';

    return { name, employeeId };
  }

  private defaultPermissionPreset() {
    return {
      accessTabs: ['dashboard'],
      accessSubPages: { dashboard: ['Dashboard page'] },
    };
  }

  private async hashPlaceholderPassword(): Promise<string> {
    return bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  }

  private ensureRegistrationActivity(user: UserDocument) {
    if (!user.registrationActivity) {
      user.registrationActivity = [] as unknown as NonNullable<
        UserDocument['registrationActivity']
      >;
    }
    return user.registrationActivity;
  }

  private ensureRegistrationDocuments(user: UserDocument) {
    if (!user.registrationDocuments) {
      user.registrationDocuments = [] as unknown as NonNullable<
        UserDocument['registrationDocuments']
      >;
    }
    return user.registrationDocuments;
  }

  private appendActivity(
    user: UserDocument,
    input: {
      action: string;
      actorType?: string;
      actorLabel?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    this.ensureRegistrationActivity(user).push({
      action: input.action,
      actorType: input.actorType ?? 'admin',
      actorLabel: input.actorLabel,
      metadata: input.metadata ?? {},
    } as UserRegistrationActivityEntry);

    const userId = String(user._id ?? '').trim();
    if (userId) {
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
        userId,
        userName: String(user.name ?? user.userid ?? user.email ?? 'User'),
        userEmail: String(user.email ?? ''),
        accountType: 'user',
        action: input.action,
        method: 'REGISTRATION',
        path: '/registration',
        metadata: {
          ...(input.metadata ?? {}),
          actorType: input.actorType ?? 'admin',
          actorLabel: input.actorLabel,
        },
      });
    }
  }

  private formatResidence(draft: RegisterPayload): string {
    const parts = [
      draft.houseNo?.trim(),
      draft.area?.trim(),
      draft.landmark?.trim(),
      draft.city?.trim(),
    ].filter(Boolean);
    if (parts.length) return parts.join(', ');
    return draft.residence?.trim() ?? '';
  }

  /** Registration employees use the same address for login email and company email. */
  private syncCompanyEmailFromUserEmail(user: UserDocument): void {
    const email = String(user.email ?? '').trim().toLowerCase();
    if (email) {
      user.companyEmail = email;
    }
  }

  private hasProfilePhotoDocument(user: UserDocument): boolean {
    return (user.registrationDocuments ?? []).some(
      (doc) => doc.documentType === 'profilePhoto',
    );
  }

  private trainingCertDocumentType(id: string): string {
    return `${TRAINING_CERT_PREFIX}${id}`;
  }

  private isTrainingCertDocumentType(documentType: string): boolean {
    return (
      documentType === 'trainingCertification' ||
      documentType.startsWith(TRAINING_CERT_PREFIX)
    );
  }

  private resolveTrainings(
    draft: RegisterPayload,
    user?: UserDocument,
  ): Array<{ id: string; title: string }> {
    if (draft.trainings?.length) {
      return draft.trainings.map((entry) => ({
        id: entry.id,
        title: entry.title?.trim() ?? '',
      }));
    }

    const fromStoredDraft = user?.registrationDraft?.trainings;
    if (fromStoredDraft?.length) {
      return fromStoredDraft.map((entry) => ({
        id: entry.id,
        title: entry.title?.trim() ?? '',
      }));
    }

    if (draft.trainingTitle?.trim()) {
      return [{ id: 'legacy', title: draft.trainingTitle.trim() }];
    }

    return [];
  }

  private hasTrainingCertForId(user: UserDocument, id: string): boolean {
    const docType = this.trainingCertDocumentType(id);
    return (user.registrationDocuments ?? []).some(
      (doc) =>
        doc.documentType === docType ||
        (id === 'legacy' && doc.documentType === 'trainingCertification'),
    );
  }

  private getTrainingCompletionChecks(
    _draft: RegisterPayload,
    _user: UserDocument,
  ): boolean[] {
    return [];
  }

  private filterMeaningfulTrainings(
    trainings: Array<{ id: string; title?: string }>,
    user: UserDocument,
  ): Array<{ id: string; title: string }> {
    return trainings
      .filter(
        (entry) => entry.title?.trim() || this.hasTrainingCertForId(user, entry.id),
      )
      .map((entry) => ({
        id: entry.id,
        title: entry.title?.trim() || 'Training',
      }));
  }

  private pruneOrphanedTrainingDocuments(
    user: UserDocument,
    trainings: Array<{ id: string }>,
  ) {
    const validTypes = new Set(
      trainings.map((entry) => this.trainingCertDocumentType(entry.id)),
    );
    if (trainings.some((entry) => entry.id === 'legacy')) {
      validTypes.add('trainingCertification');
    }

    const docs = this.ensureRegistrationDocuments(user);
    for (let index = docs.length - 1; index >= 0; index -= 1) {
      const doc = docs[index];
      if (
        this.isTrainingCertDocumentType(doc.documentType) &&
        !validTypes.has(doc.documentType)
      ) {
        docs.splice(index, 1);
      }
    }
  }

  private getTrainingCertLabel(
    trainings: Array<{ id: string; title?: string }>,
    id: string,
  ): string {
    const entry = trainings.find((item) => item.id === id);
    const title = entry?.title?.trim();
    return title ? `Training: ${title}` : 'Training certification';
  }

  private async saveRegistrationDocument(
    user: UserDocument,
    documentType: string,
    label: string,
    file: Express.Multer.File,
  ) {
    const registrationDocuments = this.ensureRegistrationDocuments(user);
    const storedName = `${Date.now()}-${file.originalname.replace(/[^\w.\-]+/g, '_')}`;
    const relativePath = `${this.uploadRoot}/${String(user._id)}/${storedName}`;
    await this.fileStorage.write(relativePath, file.buffer);

    const existing = registrationDocuments.find(
      (doc) => doc.documentType === documentType,
    );
    if (existing) {
      existing.label = label;
      existing.originalName = file.originalname;
      existing.storedName = storedName;
      existing.mimeType = file.mimetype;
      existing.verificationStatus = 'uploaded';
      return;
    }

    registrationDocuments.push({
      documentType,
      label,
      originalName: file.originalname,
      storedName,
      mimeType: file.mimetype,
      verificationStatus: 'uploaded',
    } as UserRegistrationDocument);
  }

  private computeCompletionPercent(
    draft: RegisterPayload,
    user: UserDocument,
    hasProfilePhoto: boolean,
  ): number {
    const checks = [
      Boolean(draft.firstName?.trim()),
      Boolean(draft.phone?.trim()),
      Boolean(draft.employeeId?.trim()),
      Boolean(draft.company?.trim()),
      Boolean(draft.station?.trim()),
      Boolean(draft.office?.trim()),
      Boolean(draft.department?.trim()),
      Boolean(draft.subDepartment?.trim()),
      Boolean(draft.designation?.trim()),
      Boolean(draft.joiningDate?.trim()),
      Boolean(draft.houseNo?.trim()),
      Boolean(draft.area?.trim()),
      Boolean(draft.city?.trim()),
      Boolean(draft.state?.trim()),
      Boolean(draft.country?.trim()),
      Boolean(draft.pincode?.trim()),
      Boolean(draft.emergencyContactName?.trim()),
      Boolean(draft.emergencyContactPhone?.trim()),
      ...this.getTrainingCompletionChecks(draft, user),
      hasProfilePhoto,
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }

  private isPersonalStepComplete(draft: RegisterPayload): boolean {
    return Boolean(
      draft.firstName?.trim() &&
        draft.phone?.trim() &&
        draft.employeeId?.trim() &&
        draft.company?.trim() &&
        draft.station?.trim() &&
        draft.office?.trim() &&
        draft.department?.trim() &&
        draft.subDepartment?.trim() &&
        draft.designation?.trim() &&
        draft.joiningDate?.trim(),
    );
  }

  private isAddressStepComplete(draft: RegisterPayload): boolean {
    return Boolean(
      draft.houseNo?.trim() &&
        draft.area?.trim() &&
        draft.city?.trim() &&
        draft.state?.trim() &&
        draft.pincode?.trim() &&
        draft.emergencyContactName?.trim() &&
        draft.emergencyContactPhone?.trim(),
    );
  }

  private resolveRegistrationProgress(
    draft: RegisterPayload,
    user: Pick<User, 'inviteStatus' | 'inviteLastOpenedAt'>,
    hasProfilePhoto: boolean,
  ): {
    currentStepKey: string;
    currentStepLabel: string;
    registrationStepNumber: number;
    registrationStepTotal: number;
  } {
    const totalSteps = REGISTRATION_STEP_KEYS.length;
    const inviteStatus = String(user.inviteStatus ?? '').trim().toLowerCase();

    if (inviteStatus === 'submitted' || inviteStatus === 'approved') {
      return {
        currentStepKey: 'complete',
        currentStepLabel: 'Registration submitted',
        registrationStepNumber: totalSteps,
        registrationStepTotal: totalSteps,
      };
    }

    const stored = String(
      (draft as { currentStepKey?: string }).currentStepKey ?? '',
    )
      .trim()
      .toLowerCase();
    if (REGISTRATION_STEP_KEYS.includes(stored as RegistrationStepKey)) {
      return {
        currentStepKey: stored,
        currentStepLabel: REGISTRATION_STEP_LABELS[stored as RegistrationStepKey],
        registrationStepNumber:
          REGISTRATION_STEP_KEYS.indexOf(stored as RegistrationStepKey) + 1,
        registrationStepTotal: totalSteps,
      };
    }

    if (
      !user.inviteLastOpenedAt &&
      !draft.firstName?.trim() &&
      !draft.phone?.trim()
    ) {
      return {
        currentStepKey: 'not_started',
        currentStepLabel: 'Not started',
        registrationStepNumber: 0,
        registrationStepTotal: totalSteps,
      };
    }

    if (!this.isPersonalStepComplete(draft)) {
      return {
        currentStepKey: 'personal',
        currentStepLabel: REGISTRATION_STEP_LABELS.personal,
        registrationStepNumber: 1,
        registrationStepTotal: totalSteps,
      };
    }

    if (!this.isAddressStepComplete(draft)) {
      return {
        currentStepKey: 'address',
        currentStepLabel: REGISTRATION_STEP_LABELS.address,
        registrationStepNumber: 2,
        registrationStepTotal: totalSteps,
      };
    }

    void hasProfilePhoto;
    return {
      currentStepKey: 'documents',
      currentStepLabel: REGISTRATION_STEP_LABELS.documents,
      registrationStepNumber: 3,
      registrationStepTotal: totalSteps,
    };
  }

  private applyRegistrationStepKey(
    user: UserDocument,
    stepKey?: string,
  ): RegistrationStepKey | undefined {
    const normalized = String(stepKey ?? '').trim().toLowerCase();
    if (!REGISTRATION_STEP_KEYS.includes(normalized as RegistrationStepKey)) {
      return undefined;
    }
    if (!user.registrationDraft) {
      user.registrationDraft = {};
    }
    user.registrationDraft.currentStepKey = normalized;
    return normalized as RegistrationStepKey;
  }

  private isInviteOnlyUser(user: Pick<User, 'accountStatus' | 'inviteStatus'>) {
    return user.accountStatus === 'invited' && Boolean(user.inviteStatus);
  }

  private inviteConflictMessage(
    user: Pick<User, 'accountStatus' | 'inviteStatus' | 'inviteExpiresAt'>,
  ): string {
    if (
      user.accountStatus === 'invited' &&
      user.inviteExpiresAt &&
      user.inviteExpiresAt.getTime() > Date.now() &&
      user.inviteStatus &&
      ACTIVE_INVITE_STATUSES.includes(
        user.inviteStatus as (typeof ACTIVE_INVITE_STATUSES)[number],
      )
    ) {
      return 'An active invite already exists for this email.';
    }
    if (user.accountStatus === 'rejected') {
      return 'A rejected registration exists for this email. Remove the user from the directory before sending a new invite.';
    }
    if (
      user.accountStatus === 'pending' ||
      user.inviteStatus === 'submitted'
    ) {
      return 'This email has a registration pending approval.';
    }
    if (user.accountStatus === 'active') {
      return 'A user with this email already exists.';
    }
    return 'A user with this email already exists.';
  }

  private async deliverInvite(
    user: UserDocument,
    token: string,
    admin: { userId?: string; name?: string; email?: string } | undefined,
    activityAction: 'invite.created' | 'invite.reissued',
  ) {
    let persisted = await this.userModel
      .findById(user._id)
      .select('inviteToken accountStatus inviteStatus')
      .exec();
    if (!persisted?.inviteToken) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { inviteToken: token } },
      );
      persisted = await this.userModel
        .findById(user._id)
        .select('inviteToken accountStatus inviteStatus')
        .exec();
    }

    const inviteUrl = this.buildInviteUrl(token, String(user._id));

    this.appendActivity(user, {
      action: activityAction,
      actorLabel: admin?.name || admin?.email || 'Admin',
      metadata: { email: user.email, inviteUrl },
    });
    await user.save();

    const emailResult = await this.mailer.sendWelcomeInviteEmail({
      to: user.email,
      inviteUrl,
      company: user.company,
      invitedRole: user.role,
      expiresAt: user.inviteExpiresAt!,
    });

    if (!emailResult.sent) {
      this.appendActivity(user, {
        action: 'invite.email_failed',
        actorLabel: admin?.name || admin?.email || 'Admin',
        metadata: { email: user.email, error: emailResult.error },
      });
      await user.save();
    }

    return {
      success: true,
      data: {
        inviteId: String(user._id),
        inviteCode: user.inviteCode,
        email: user.email,
        expiresAt: user.inviteExpiresAt?.toISOString(),
        inviteUrl,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
      },
    };
  }

  private async reissueInviteOnExistingUser(
    user: UserDocument,
    body: CreateUserInviteDto,
    admin: { userId?: string; name?: string; email?: string } | undefined,
    expiresAt: Date,
    permissionFields: Record<string, unknown>,
  ) {
    const token = this.generateToken();
    const inviteCode = this.generateInviteCode();
    const departmentLabel = body.department?.trim() || 'Operations';

    this.removeInviteUploads(String(user._id));

    user.name = `Invite: ${user.email}`;
    user.userid = inviteCode;
    user.inviteCode = inviteCode;
    user.inviteToken = token;
    user.role = 'employee';
    user.authorizationRole = 'employee';
    user.departmentLabel = departmentLabel;
    user.subDepartment = body.subDepartment?.trim();
    user.designation = body.designation?.trim();
    user.company = body.company?.trim();
    user.station = body.station?.trim();
    user.department = buildDepartmentRecord(departmentLabel, body.subDepartment);
    Object.assign(user, permissionFields);
    user.status = 'Invited';
    user.isActive = false;
    user.accountStatus = 'invited';
    user.approvalStatus = 'pending';
    user.registrationStatus = 'invited';
    user.inviteStatus = 'sent';
    user.inviteExpiresAt = expiresAt;
    user.inviteSentCount = (user.inviteSentCount ?? 0) + 1;
    user.inviteNote = body.note?.trim();
    user.inviteCreatedByAdminId = admin?.userId;
    user.inviteCreatedByAdminName = admin?.name || admin?.email;
    user.registrationDraft = {};
    user.registrationDocuments = [] as unknown as NonNullable<
      UserDocument['registrationDocuments']
    >;
    await user.save();

    emitAdminNotification(this.eventEmitter, {
      kind: 'invite_sent',
      title: 'Employee invite sent',
      subtitle: user.email,
      actorName: admin?.name || admin?.email || 'Admin',
      entityType: 'user',
      entityId: String(user._id),
    });

    return this.deliverInvite(user, token, admin, 'invite.reissued');
  }

  private async findActiveInviteByToken(token: string, inviteId?: string) {
    const normalized = this.normalizeInviteToken(token);
    let user = await this.userModel.findOne({ inviteToken: normalized }).exec();

    if (!user && inviteId?.trim()) {
      const byId = await this.userModel.findById(inviteId.trim()).exec();
      if (
        byId &&
        byId.accountStatus === 'invited' &&
        byId.inviteStatus &&
        byId.inviteStatus !== 'revoked'
      ) {
        user = byId;
        if (!user.inviteToken) {
          user.inviteToken = normalized;
          await user.save();
        } else if (user.inviteToken !== normalized) {
          user = null;
        }
      }
    }

    if (!user) {
      throw new NotFoundException('Invite not found');
    }
    if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
      user.inviteStatus = 'expired';
      await user.save();
      throw new BadRequestException('Invite expired');
    }
    if (user.inviteStatus === 'revoked') {
      throw new BadRequestException('Invite revoked');
    }
    return user;
  }

  private serializeInvite(
    user: UserDocument,
    documents: Array<{
      id: string;
      documentType: string;
      label: string;
      originalName: string;
      publicUrl: string;
      verificationStatus: string;
      updatedAt?: Date;
    }> = [],
  ) {
    const draft = user.registrationDraft ?? {};
    const docsCount = documents.length || user.registrationDocuments?.length || 0;
    const completionPercent = this.computeCompletionPercent(
      draft as RegisterPayload,
      user,
      this.hasProfilePhotoDocument(user),
    );

    return {
      inviteId: String(user._id),
      inviteCode: user.inviteCode,
      email: user.email,
      status: user.inviteStatus,
      expiresAt: user.inviteExpiresAt?.toISOString(),
      invitedRole: user.role,
      department: user.departmentLabel,
      subDepartment: user.subDepartment,
      designation: user.designation,
      company: user.company,
      station: user.station,
      completionPercent,
      documents,
      permissionPreset: user.permissions ?? this.defaultPermissionPreset(),
      draft: {
        firstName: draft.firstName,
        middleName: draft.middleName,
        lastName: draft.lastName,
        gender: draft.gender,
        dob: draft.dob,
        bloodGroup: draft.bloodGroup,
        email: draft.email ?? user.email,
        nationality: draft.nationality,
        phone: draft.phone,
        alternatePhone: draft.alternatePhone,
        employeeId: draft.employeeId,
        company: draft.company ?? user.company,
        station: draft.station ?? user.station,
        office: draft.office,
        department: draft.department ?? user.departmentLabel,
        subDepartment: draft.subDepartment ?? user.subDepartment,
        designation: draft.designation ?? user.designation,
        joiningDate: draft.joiningDate ?? user.joiningDate,
        houseNo: draft.houseNo,
        area: draft.area,
        landmark: draft.landmark,
        city: draft.city,
        residence: this.formatResidence(draft as RegisterPayload),
        state: draft.state,
        country: draft.country,
        pincode: draft.pincode,
        emergencyContactName: draft.emergencyContactName,
        emergencyContactPhone: draft.emergencyContactPhone,
        aadharCardNo: draft.aadharCardNo,
        panCardNo: draft.panCardNo,
        trainingTitle: draft.trainingTitle,
        trainings: this.resolveTrainings(draft as RegisterPayload, user),
        completionPercent,
        currentStepKey: draft.currentStepKey,
      },
    };
  }

  private mapRegistrationDocuments(user: UserDocument, inviteToken?: string) {
    return (user.registrationDocuments ?? []).map((doc) => {
      const docId = String(doc._id);
      const publicUrl = inviteToken
        ? `/register-invite/documents/${docId}/file?token=${encodeURIComponent(inviteToken)}`
        : `/user-registration/documents/${docId}/file`;
      return {
        id: docId,
        documentType: doc.documentType,
        label: doc.label,
        originalName: doc.originalName,
        publicUrl,
        verificationStatus: doc.verificationStatus,
        updatedAt: (doc as { updatedAt?: Date }).updatedAt,
      };
    });
  }

  private buildPermissionFields(preset?: {
    accessTabs?: string[];
    accessSubPages?: Record<string, string[]>;
  }) {
    const accessSubPages = normalizeAccessSubPages(
      preset?.accessTabs ?? [],
      preset?.accessSubPages ?? {},
    );
    return {
      permissions: {
        accessTabs: preset?.accessTabs ?? [],
        accessSubPages,
      },
      flags: buildFlagsFromPermissions(accessSubPages),
    };
  }

  async createInvite(
    body: CreateUserInviteDto,
    admin?: { userId?: string; name?: string; email?: string },
  ) {
    const email = body.email.trim().toLowerCase();
    const expiresInHours = body.expiresInHours ?? 72;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const permissionPreset =
      body.permissionPreset ?? this.defaultPermissionPreset();
    const permissionFields = this.buildPermissionFields(permissionPreset);

    const existingPending = await this.userModel
      .findOne({
        email,
        accountStatus: 'invited',
        inviteStatus: { $in: ACTIVE_INVITE_STATUSES },
        inviteExpiresAt: { $gt: new Date() },
      })
      .exec();
    if (existingPending) {
      throw new ConflictException(
        'An active invite already exists for this email.',
      );
    }

    const existingActive = await this.userModel
      .findOne({
        email,
        accountStatus: { $in: ['active', 'pending'] },
      })
      .exec();
    if (existingActive) {
      throw new ConflictException('A user with this email already exists.');
    }

    const existingByEmail = await this.userModel.findOne({ email }).exec();
    if (existingByEmail) {
      if (this.isInviteOnlyUser(existingByEmail)) {
        return this.reissueInviteOnExistingUser(
          existingByEmail,
          body,
          admin,
          expiresAt,
          permissionFields,
        );
      }
      throw new ConflictException(this.inviteConflictMessage(existingByEmail));
    }

    const token = this.generateToken();
    const inviteCode = this.generateInviteCode();
    const departmentLabel = body.department?.trim() || 'Operations';

    const user = await this.userModel.create({
      name: `Invite: ${email}`,
      userid: inviteCode,
      email,
      password: await this.hashPlaceholderPassword(),
      role: 'employee',
      authorizationRole: 'employee',
      departmentLabel,
      subDepartment: body.subDepartment?.trim(),
      designation: body.designation?.trim(),
      company: body.company?.trim(),
      station: body.station?.trim(),
      department: buildDepartmentRecord(departmentLabel, body.subDepartment),
      ...permissionFields,
      status: 'Invited',
      isActive: false,
      accountStatus: 'invited',
      approvalStatus: 'pending',
      registrationStatus: 'invited',
      inviteToken: token,
      inviteCode,
      inviteStatus: 'sent',
      inviteExpiresAt: expiresAt,
      inviteSentCount: 1,
      inviteNote: body.note?.trim(),
      inviteCreatedByAdminId: admin?.userId,
      inviteCreatedByAdminName: admin?.name || admin?.email,
      registrationDraft: {},
      registrationDocuments: [],
      registrationActivity: [],
    });

    emitAdminNotification(this.eventEmitter, {
      kind: 'invite_sent',
      title: 'Employee invite sent',
      subtitle: email,
      actorName: admin?.name || admin?.email || 'Admin',
      entityType: 'user',
      entityId: String(user._id),
    });
    await user.save();

    return this.deliverInvite(user, token, admin, 'invite.created');
  }

  private inviteErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        if (Array.isArray(message)) return message.join(', ');
        if (typeof message === 'string') return message;
      }
    }
    if (error instanceof Error) return error.message;
    return 'Failed to create invite';
  }

  async createInvitesBulk(
    body: BulkCreateUserInvitesDto,
    admin?: { userId?: string; name?: string; email?: string },
  ) {
    const emails = [
      ...new Set(
        body.emails
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0),
      ),
    ];

    if (emails.length === 0) {
      throw new BadRequestException('At least one email address is required.');
    }

    const results: Array<{
      email: string;
      success: boolean;
      inviteId?: string;
      inviteCode?: string;
      expiresAt?: string;
      inviteUrl?: string;
      emailSent?: boolean;
      emailError?: string;
      error?: string;
    }> = [];

    for (const email of emails) {
      try {
        const created = await this.createInvite(
          {
            ...body,
            email,
          },
          admin,
        );
        const data = created.data;
        results.push({
          email,
          success: true,
          inviteId: data.inviteId,
          inviteCode: data.inviteCode,
          expiresAt: data.expiresAt,
          inviteUrl: data.inviteUrl,
          emailSent: data.emailSent,
          emailError: data.emailError,
        });
      } catch (error) {
        results.push({
          email,
          success: false,
          error: this.inviteErrorMessage(error),
        });
      }
    }

    const succeeded = results.filter((row) => row.success).length;

    return {
      success: true,
      data: {
        total: emails.length,
        succeeded,
        failed: emails.length - succeeded,
        results,
      },
    };
  }

  private removeInviteUploads(userId: string) {
    const userDir = path.join(this.uploadRoot, userId);
    if (!fs.existsSync(userDir)) return;
    fs.rmSync(userDir, { recursive: true, force: true });
  }

  async removeInvite(
    body: RemoveUserInviteDto,
    admin?: { name?: string; email?: string },
  ) {
    const user = await this.userModel.findById(body.inviteId).exec();
    if (!user || !user.inviteToken) {
      throw new NotFoundException('Invite not found');
    }

    if (
      user.inviteStatus &&
      !REMOVABLE_INVITE_STATUSES.includes(
        user.inviteStatus as (typeof REMOVABLE_INVITE_STATUSES)[number],
      )
    ) {
      throw new BadRequestException(
        'This invite cannot be removed because registration was already submitted. Reject the user from pending approvals instead.',
      );
    }

    if (!this.isInviteOnlyUser(user)) {
      throw new BadRequestException(
        'Only outstanding invites can be removed from invite management.',
      );
    }

    const email = user.email;
    this.removeInviteUploads(String(user._id));
    await user.deleteOne();

    return {
      success: true,
      data: {
        inviteId: body.inviteId,
        email,
        removed: true,
      },
    };
  }

  async resendInvite(
    body: ResendUserInviteDto,
    admin?: { name?: string; email?: string },
  ) {
    const user = await this.userModel.findById(body.inviteId).exec();
    if (!user || !user.inviteToken) {
      throw new NotFoundException('Invite not found');
    }

    if (
      user.inviteExpiresAt &&
      user.inviteExpiresAt.getTime() < Date.now()
    ) {
      user.inviteExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      user.inviteStatus = 'sent';
    }

    user.inviteSentCount = (user.inviteSentCount ?? 0) + 1;
    const inviteUrl = this.buildInviteUrl(
      user.inviteToken,
      String(user._id),
    );

    this.appendActivity(user, {
      action: 'invite.resent',
      actorLabel: admin?.name || admin?.email || 'Admin',
      metadata: { email: user.email, inviteUrl },
    });
    await user.save();

    const emailResult = await this.mailer.sendWelcomeInviteEmail({
      to: user.email,
      inviteUrl,
      company: user.company,
      invitedRole: user.role,
      expiresAt: user.inviteExpiresAt!,
    });

    if (!emailResult.sent) {
      this.appendActivity(user, {
        action: 'invite.email_failed',
        actorLabel: admin?.name || admin?.email || 'Admin',
        metadata: { email: user.email, error: emailResult.error },
      });
      await user.save();
    }

    return {
      success: true,
      data: {
        inviteId: String(user._id),
        email: user.email,
        expiresAt: user.inviteExpiresAt?.toISOString(),
        inviteUrl,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
      },
    };
  }

  private async loadAdminPanelStationScopeContext(
    principal?: AuthenticatedPrincipal,
  ) {
    const scope = await this.adminPanelStationScope.resolve(principal);
    if (scope === 'all') {
      return {
        scope,
        allowedStationIds: null as Set<string> | null,
        allowedStationLabels: null as Set<string> | null,
      };
    }

    const stationDocs = await this.stationModel
      .find({ _id: { $in: scope } })
      .select('code name city stationCode')
      .lean()
      .exec();

    return {
      scope,
      allowedStationIds: new Set(stationDocs.map((row) => String(row._id))),
      allowedStationLabels: new Set(
        stationDocs.map((row) => formatAdminStationLabel(row)),
      ),
    };
  }

  private userInAdminPanelStationScope(
    user: { assignedStationIds?: unknown; station?: unknown },
    ctx: Awaited<ReturnType<typeof this.loadAdminPanelStationScopeContext>>,
  ): boolean {
    if (ctx.scope === 'all') return true;
    return userBelongsToAdminPanelStationScope(
      ctx.scope,
      user,
      ctx.allowedStationIds ?? new Set(),
      ctx.allowedStationLabels ?? new Set(),
    );
  }

  async getWorkspace(principal?: AuthenticatedPrincipal) {
    const stationScope = await this.loadAdminPanelStationScopeContext(principal);

    const users = await this.userModel
      .find()
      .select('-password')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const scopedUsers = users.filter((user) => {
      if (this.userInAdminPanelStationScope(user, stationScope)) return true;
      return (
        stationScope.scope !== 'all' &&
        Array.isArray(stationScope.scope) &&
        stationScope.scope.length > 0 &&
        this.isInviteOnlyUser(user as User) &&
        inviteUserHasNoStationBinding(user)
      );
    });

    const inviteUsers = scopedUsers.filter(
      (user) =>
        user.accountStatus === 'invited' ||
        (user.inviteStatus &&
          ['sent', 'opened', 'draft', 'submitted', 'approved', 'rejected'].includes(
            user.inviteStatus,
          )),
    );

    const registeredUsers = scopedUsers.filter(
      (user) => !this.isInviteOnlyUser(user as User),
    );

    const pendingApprovals = registeredUsers.filter(
      (user) =>
        user.approvalStatus === 'pending' ||
        user.accountStatus === 'pending' ||
        user.registrationStatus === 'pending',
    );

    const activeUsers = registeredUsers.filter(
      (user) => user.isActive !== false && user.accountStatus === 'active',
    );
    const removedPendingApprovals = registeredUsers.filter(
      (user) =>
        user.approvalStatus === 'rejected' ||
        user.accountStatus === 'rejected' ||
        user.registrationStatus === 'rejected',
    );

    const inviteRows = inviteUsers.map((user) => {
      const draft = user.registrationDraft ?? {};
      const hasProfilePhoto = this.hasProfilePhotoDocument(user as UserDocument);
      const completionPercent = this.computeCompletionPercent(
        draft as RegisterPayload,
        user as UserDocument,
        hasProfilePhoto,
      );
      const progress = this.resolveRegistrationProgress(
        draft as RegisterPayload,
        user as User,
        hasProfilePhoto,
      );
      const identity = this.resolveInviteeIdentity(user as User, draft as RegisterPayload);
      return {
        id: String(user._id),
        inviteCode: user.inviteCode,
        name: identity.name,
        employeeId: identity.employeeId,
        email: user.email,
        status: user.inviteStatus,
        invitedRole: user.role,
        department: user.departmentLabel,
        company: user.company,
        station: user.station,
        sentCount: user.inviteSentCount ?? 0,
        expiresAt: user.inviteExpiresAt,
        lastOpenedAt: user.inviteLastOpenedAt,
        linkedUserId: String(user._id),
        createdAt: (user as { createdAt?: Date }).createdAt,
        completionPercent,
        currentStepKey: progress.currentStepKey,
        currentStepLabel: progress.currentStepLabel,
        registrationStepNumber: progress.registrationStepNumber,
        registrationStepTotal: progress.registrationStepTotal,
        inviteUrl: user.inviteToken
          ? this.buildInviteUrl(user.inviteToken, String(user._id))
          : undefined,
      };
    });

    const activity = scopedUsers
      .flatMap((user) =>
        (user.registrationActivity ?? []).map((entry, index) => ({
          id: `${String(user._id)}:${index}`,
          action: entry.action,
          actorType: entry.actorType,
          actorLabel: entry.actorLabel,
          inviteId: String(user._id),
          userId: String(user._id),
          metadata: entry.metadata ?? {},
          createdAt: (entry as { createdAt?: Date }).createdAt,
        })),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      )
      .slice(0, 100);

    return {
      success: true,
      data: {
        metrics: {
          invitesOutstanding: inviteRows.filter((row) =>
            ACTIVE_INVITE_STATUSES.includes(
              row.status as (typeof ACTIVE_INVITE_STATUSES)[number],
            ),
          ).length,
          pendingApprovals: pendingApprovals.length,
          activeUsers: activeUsers.length,
          removedPendingApprovals: removedPendingApprovals.length,
        },
        invites: inviteRows,
        users: registeredUsers.map((user) => ({
          id: String(user._id),
          userid: user.userid,
          employeeId: user.employeeId ?? user.userid,
          admNumber: user.admNumber,
          name: user.name,
          email: user.email,
          companyEmail: user.companyEmail ?? user.email ?? '',
          role: user.role,
          department: user.departmentLabel,
          subDepartment: user.subDepartment,
          designation: user.designation,
          company: user.company,
          station: user.station,
          status: user.status,
          accountStatus: user.accountStatus,
          approvalStatus: user.approvalStatus,
          isActive: user.isActive,
          inviteId: user.inviteId ?? String(user._id),
          lastActivityAt: user.lastActivityAt,
          createdAt: (user as { createdAt?: Date }).createdAt,
        })),
        pendingApprovals: pendingApprovals.map((user) => ({
          id: String(user._id),
          userid: user.userid,
          employeeId: user.employeeId ?? user.userid,
          admNumber: user.admNumber,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.departmentLabel,
          approvalStatus: user.approvalStatus,
          accountStatus: user.accountStatus,
          inviteId: user.inviteId ?? String(user._id),
          createdAt: (user as { createdAt?: Date }).createdAt,
        })),
        removedPendingApprovals: removedPendingApprovals.map((user) => ({
          id: String(user._id),
          userid: user.userid,
          employeeId: user.employeeId ?? user.userid,
          admNumber: user.admNumber,
          name: user.name,
          email: user.email,
          companyEmail: user.companyEmail ?? user.email ?? '',
          role: user.role,
          department: user.departmentLabel,
          subDepartment: user.subDepartment,
          designation: user.designation,
          company: user.company,
          station: user.station,
          status: user.status,
          accountStatus: user.accountStatus,
          approvalStatus: user.approvalStatus,
          isActive: user.isActive,
          inviteId: user.inviteId ?? String(user._id),
          lastActivityAt: user.lastActivityAt,
          createdAt: (user as { createdAt?: Date }).createdAt,
        })),
        activity,
      },
    };
  }

  /** Full per-user activity log for admin CSV export (no row cap). */
  async listExportUserActivityLog() {
    const users = await this.userModel
      .find()
      .select(
        'userid employeeId name email companyEmail departmentLabel subDepartment designation company station accountStatus approvalStatus registrationActivity lastActivityAt createdAt',
      )
      .lean()
      .exec();

    const rows = users.flatMap((user) => {
      const base = {
        userId: String(user._id),
        employeeId: user.employeeId ?? user.userid,
        userName: user.name,
        userEmail: user.email,
        companyEmail: user.companyEmail ?? '',
        department: user.departmentLabel ?? '',
        subDepartment: user.subDepartment ?? '',
        designation: user.designation ?? '',
        company: user.company ?? '',
        station: user.station ?? '',
        accountStatus: user.accountStatus ?? '',
        approvalStatus: user.approvalStatus ?? '',
        lastActivityAt: user.lastActivityAt
          ? new Date(user.lastActivityAt).toISOString()
          : '',
        userCreatedAt: (user as { createdAt?: Date }).createdAt
          ? new Date((user as { createdAt?: Date }).createdAt!).toISOString()
          : '',
      };

      const activity = user.registrationActivity ?? [];
      if (!activity.length) {
        return [];
      }

      return activity.map((entry, index) => ({
        ...base,
        logId: `${String(user._id)}:${index}`,
        action: entry.action,
        actorType: entry.actorType ?? '',
        actorLabel: entry.actorLabel ?? '',
        eventAt: (entry as { createdAt?: Date }).createdAt
          ? new Date((entry as { createdAt?: Date }).createdAt!).toISOString()
          : '',
        metadata: JSON.stringify(entry.metadata ?? {}),
      }));
    });

    rows.sort(
      (a, b) =>
        new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime(),
    );

    return {
      success: true,
      count: rows.length,
      data: rows,
    };
  }

  async verifyInvite(token: string, inviteId?: string) {
    const user = await this.findActiveInviteByToken(token, inviteId);
    if (
      user.inviteStatus &&
      !['submitted', 'approved'].includes(user.inviteStatus)
    ) {
      user.inviteStatus = user.inviteStatus === 'sent' ? 'opened' : user.inviteStatus;
      user.inviteLastOpenedAt = new Date();
      if (!user.registrationDraft) {
        user.registrationDraft = {};
      }
      if (!user.registrationDraft.currentStepKey) {
        user.registrationDraft.currentStepKey = 'personal';
      }
      await user.save();
    }

    const serialized = this.serializeInvite(
      user,
      this.mapRegistrationDocuments(user, token),
    );

    return { success: true, data: serialized };
  }

  async registerUser(payloadRaw: string, files: Express.Multer.File[]) {
    let payload: RegisterPayload;
    try {
      payload = JSON.parse(payloadRaw) as RegisterPayload;
    } catch {
      throw new BadRequestException('Invalid registration payload');
    }

    if (!payload.token?.trim()) {
      throw new BadRequestException('Invite token is required');
    }

    const user = await this.findActiveInviteByToken(
      payload.token.trim(),
      payload.inviteId,
    );
    if (user.inviteStatus && ['submitted', 'approved'].includes(user.inviteStatus)) {
      throw new BadRequestException('Registration already submitted');
    }

    if (payload.submissionMode === 'step') {
      const step = this.applyRegistrationStepKey(
        user,
        payload.registrationStepKey,
      );
      if (!step) {
        throw new BadRequestException('registrationStepKey is required');
      }
      if (user.inviteStatus === 'sent') {
        user.inviteStatus = 'opened';
      }
      user.inviteLastOpenedAt = new Date();
      await user.save();
      return {
        success: true,
        data: { currentStepKey: step },
      };
    }

    const preservedStepKey = user.registrationDraft?.currentStepKey;

    user.registrationDraft = {
      ...user.registrationDraft,
      firstName: payload.firstName?.trim() || user.registrationDraft?.firstName,
      middleName: payload.middleName?.trim() || user.registrationDraft?.middleName,
      lastName: payload.lastName?.trim() || user.registrationDraft?.lastName,
      gender: payload.gender?.trim() || user.registrationDraft?.gender,
      dob: payload.dob?.trim() || user.registrationDraft?.dob,
      bloodGroup: payload.bloodGroup?.trim() || user.registrationDraft?.bloodGroup,
      email: payload.email?.trim() || user.registrationDraft?.email || user.email,
      nationality: payload.nationality?.trim() || user.registrationDraft?.nationality,
      phone: payload.phone?.trim() || user.registrationDraft?.phone,
      alternatePhone:
        payload.alternatePhone?.trim() || user.registrationDraft?.alternatePhone,
      employeeId:
        payload.employeeId?.trim().toUpperCase() ||
        user.registrationDraft?.employeeId,
      company: payload.company?.trim() || user.registrationDraft?.company,
      station: payload.station?.trim() || user.registrationDraft?.station,
      office: payload.office?.trim() || user.registrationDraft?.office,
      department:
        payload.department?.trim() || user.registrationDraft?.department,
      subDepartment:
        payload.subDepartment?.trim() || user.registrationDraft?.subDepartment,
      designation:
        payload.designation?.trim() || user.registrationDraft?.designation,
      joiningDate:
        payload.joiningDate?.trim() || user.registrationDraft?.joiningDate,
      houseNo: payload.houseNo?.trim() || user.registrationDraft?.houseNo,
      area: payload.area?.trim() || user.registrationDraft?.area,
      landmark: payload.landmark?.trim() || user.registrationDraft?.landmark,
      city: payload.city?.trim() || user.registrationDraft?.city,
      state: payload.state?.trim() || user.registrationDraft?.state,
      country: payload.country?.trim() || user.registrationDraft?.country,
      pincode: payload.pincode?.trim() || user.registrationDraft?.pincode,
      emergencyContactName:
        payload.emergencyContactName?.trim() ||
        user.registrationDraft?.emergencyContactName,
      emergencyContactPhone:
        payload.emergencyContactPhone?.trim() ||
        user.registrationDraft?.emergencyContactPhone,
      aadharCardNo:
        payload.aadharCardNo?.trim() || user.registrationDraft?.aadharCardNo,
      panCardNo: payload.panCardNo?.trim() || user.registrationDraft?.panCardNo,
      trainingTitle:
        payload.trainingTitle?.trim() || user.registrationDraft?.trainingTitle,
      trainings:
        payload.trainings?.map((entry) => ({
          id: entry.id?.trim() || crypto.randomUUID(),
          title: entry.title?.trim() ?? '',
        })) ?? user.registrationDraft?.trainings,
      currentStepKey: preservedStepKey,
    };
    user.registrationDraft.residence = this.formatResidence(
      user.registrationDraft as RegisterPayload,
    );

    const trainings = this.resolveTrainings(
      user.registrationDraft as RegisterPayload,
      user,
    );
    user.registrationDraft.trainings = trainings;
    user.registrationDraft.trainingTitle = trainings[0]?.title;
    this.pruneOrphanedTrainingDocuments(user, trainings);

    for (const file of files) {
      if (!file?.buffer?.length) continue;

      if (file.fieldname === 'profilePhoto') {
        await this.saveRegistrationDocument(
          user,
          'profilePhoto',
          DOCUMENT_LABELS.profilePhoto,
          file,
        );
        continue;
      }

      if (file.fieldname.startsWith(TRAINING_CERT_FILE_PREFIX)) {
        const trainingId = file.fieldname.slice(TRAINING_CERT_FILE_PREFIX.length);
        if (!trainingId) continue;
        await this.saveRegistrationDocument(
          user,
          this.trainingCertDocumentType(trainingId),
          this.getTrainingCertLabel(trainings, trainingId),
          file,
        );
      }
    }

    user.registrationDraft.completionPercent = this.computeCompletionPercent(
      user.registrationDraft as RegisterPayload,
      user,
      this.hasProfilePhotoDocument(user),
    );

    this.applyRegistrationStepKey(user, payload.registrationStepKey);

    if (payload.submissionMode === 'draft') {
      user.inviteStatus = 'draft';
      this.appendActivity(user, {
        action: 'invite.draft_saved',
        actorType: 'user',
        actorLabel: user.email,
      });
      await user.save();
      const inviteData = (
        await this.verifyInvite(user.inviteToken!, String(user._id))
      ).data;
      return {
        success: true,
        data: {
          invite: inviteData,
          completionPercent: user.registrationDraft.completionPercent,
        },
      };
    }

    const draft = user.registrationDraft;
    if (!draft.firstName?.trim() || !draft.phone?.trim()) {
      throw new BadRequestException('Personal details are incomplete');
    }
    const employeeIdValue = draft.employeeId?.trim().toUpperCase() ?? '';
    if (!employeeIdValue || !/^[A-Z0-9]{1,16}$/.test(employeeIdValue)) {
      throw new BadRequestException('A valid employee ID is required');
    }
    if (
      !draft.company?.trim() ||
      !draft.station?.trim() ||
      !draft.office?.trim() ||
      !draft.department?.trim() ||
      draft.department.trim().toLowerCase() === 'other' ||
      !draft.subDepartment?.trim() ||
      draft.subDepartment.trim().toLowerCase() === 'other' ||
      !draft.designation?.trim() ||
      !draft.joiningDate?.trim()
    ) {
      throw new BadRequestException('Employment details are incomplete');
    }
    if (
      !draft.houseNo?.trim() ||
      !draft.area?.trim() ||
      !draft.city?.trim() ||
      !draft.state?.trim() ||
      !draft.country?.trim() ||
      !draft.pincode?.trim()
    ) {
      throw new BadRequestException('Address details are incomplete');
    }
    if (!/^\d{6}$/.test(draft.pincode.trim())) {
      throw new BadRequestException('A valid 6-digit pincode is required');
    }

    const meaningfulTrainings = this.filterMeaningfulTrainings(trainings, user);
    this.pruneOrphanedTrainingDocuments(user, meaningfulTrainings);

    const firstName = draft.firstName.trim();
    const middleName = draft.middleName?.trim() ?? '';
    const lastName = draft.lastName?.trim() ?? '';
    const name = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || firstName;
    const stationLabel =
      draft.station?.trim() || draft.office?.trim() || user.station || 'FRIS';
    const employeeIdTaken = await this.userModel
      .findOne({ userid: employeeIdValue, _id: { $ne: user._id } })
      .lean()
      .exec();
    if (employeeIdTaken) {
      throw new ConflictException('Employee ID is already in use');
    }
    const employeeId = employeeIdValue;
    const company = draft.company?.trim() || user.company || '';

    const departmentLabel = draft.department?.trim() || user.departmentLabel?.trim() || 'Operations';
    const subDepartment =
      draft.subDepartment?.trim() || user.subDepartment?.trim() || undefined;
    const designation =
      draft.designation?.trim() || user.designation?.trim() || undefined;
    const accessSubPages = normalizeAccessSubPages(
      user.permissions?.accessTabs ?? [],
      user.permissions?.accessSubPages ?? {},
    );
    const flags = buildFlagsFromPermissions(accessSubPages);

    const registrationEmail = draft.email?.trim().toLowerCase();
    if (registrationEmail) {
      const emailTaken = await this.userModel
        .findOne({ email: registrationEmail, _id: { $ne: user._id } })
        .lean()
        .exec();
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
      user.email = registrationEmail;
      user.companyEmail = registrationEmail;
    }

    user.name = name;
    user.userid = employeeId;
    user.employeeId = employeeId;
    user.firstName = firstName;
    user.middleName = middleName || undefined;
    user.lastName = lastName;
    user.gender = draft.gender;
    user.dob = draft.dob;
    user.bloodGroup = draft.bloodGroup;
    user.nationality = draft.nationality;
    user.phone = draft.phone;
    user.alternatePhone = draft.alternatePhone;
    user.houseNo = draft.houseNo?.trim();
    user.area = draft.area?.trim();
    user.landmark = draft.landmark?.trim();
    user.city = draft.city?.trim();
    user.residence = this.formatResidence(draft as RegisterPayload);
    user.state = draft.state;
    user.country = draft.country;
    user.pincode = draft.pincode;
    user.emergencyContactName = draft.emergencyContactName;
    user.emergencyContactPhone = draft.emergencyContactPhone;
    user.trainings = meaningfulTrainings.map((entry) => ({
      id: entry.id,
      title: entry.title?.trim(),
    }));
    user.trainingTitle = meaningfulTrainings[0]?.title?.trim();
    user.company = company;
    user.station = stationLabel;
    user.locations = draft.office?.trim();
    user.departmentLabel = departmentLabel;
    user.subDepartment = subDepartment;
    user.designation = designation;
    user.joiningDate = draft.joiningDate?.trim();
    user.department = buildDepartmentRecord(departmentLabel, subDepartment);
    user.flags = flags;
    user.permissions = {
      accessTabs: user.permissions?.accessTabs ?? [],
      accessSubPages,
    };
    user.status = 'Pending Approval';
    user.isActive = false;
    user.accountStatus = 'pending';
    user.approvalStatus = 'pending';
    user.registrationStatus = 'pending';
    user.inviteId = String(user._id);
    user.inviteStatus = 'submitted';
    user.registrationDraft.completionPercent = 100;

    user.registrationDraft.trainings = meaningfulTrainings;
    user.registrationDraft.trainingTitle = meaningfulTrainings[0]?.title;

    this.appendActivity(user, {
      action: 'registration.submitted',
      actorType: 'user',
      actorLabel: user.email,
    });
    emitAdminNotification(this.eventEmitter, {
      kind: 'registration_submitted',
      title: 'Registration submitted',
      subtitle: `${name} · ${user.email} is pending approval`,
      actorName: user.email,
      entityType: 'user',
      entityId: String(user._id),
    });
    await user.save();
    this.pendingApprovalAlert.scheduleAlertForUser(String(user._id));

    return {
      success: true,
      data: {
        userId: String(user._id),
        inviteId: String(user._id),
        completionPercent: 100,
      },
    };
  }

  async getDocumentFile(documentId: string) {
    return this.resolveDocumentFile(documentId);
  }

  async getDocumentFileForInvite(documentId: string, inviteToken: string) {
    const user = await this.userModel
      .findOne({ 'registrationDocuments._id': documentId })
      .select('+inviteToken')
      .exec();
    if (!user?.inviteToken) {
      throw new NotFoundException('Document not found');
    }

    const expected = String(user.inviteToken);
    const provided = String(inviteToken);
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new ForbiddenException('Invalid invite token');
    }

    return this.resolveDocumentFile(documentId, user);
  }

  private async resolveDocumentFile(documentId: string, knownUser?: UserDocument) {
    const user =
      knownUser ??
      (await this.userModel
        .findOne({ 'registrationDocuments._id': documentId })
        .exec());
    if (!user) throw new NotFoundException('Document not found');

    const doc = user.registrationDocuments?.find(
      (entry) => String(entry._id) === documentId,
    );
    if (!doc) throw new NotFoundException('Document not found');

    const relativePath = `${this.uploadRoot}/${String(user._id)}/${doc.storedName}`;

    return {
      filePath: relativePath,
      mimeType: doc.mimeType,
      originalName: doc.originalName,
    };
  }

  async approveUser(
    body: ApproveRegisteredUserDto,
    admin?: { name?: string; email?: string },
  ) {
    const user = await this.userModel.findById(body.userId).exec();
    if (!user) throw new NotFoundException('User not found');

    this.syncCompanyEmailFromUserEmail(user);

    user.isActive = true;
    user.accountStatus = 'active';
    user.approvalStatus = 'approved';
    user.registrationStatus = 'approved';
    user.status = 'Active';
    user.approvedAt = new Date();
    user.inviteStatus = 'approved';

    await this.userService.ensurePanelUserAdmNumber(user);

    this.appendActivity(user, {
      action: 'registration.approved',
      actorLabel: admin?.name || admin?.email || 'Admin',
      metadata: { note: body.note },
    });
    emitAdminNotification(this.eventEmitter, {
      kind: 'registration_approved',
      title: 'Registration approved',
      subtitle: `${user.name || user.email} is now active`,
      actorName: admin?.name || admin?.email || 'Admin',
      entityType: 'user',
      entityId: String(user._id),
    });
    await this.userService.savePanelUserWithAdmNumberRetry(user);

    let credentialsEmailSent = false;
    let credentialsEmailError: string | undefined;

    if (body.sendCredentials) {
      const toEmail = String(user.companyEmail ?? user.email ?? '')
        .trim()
        .toLowerCase();
      const employeeId = String(user.employeeId ?? user.userid ?? '').trim();
      if (!toEmail) {
        credentialsEmailError = 'Employee email is missing.';
      } else if (!employeeId) {
        credentialsEmailError = 'Employee ID is missing.';
      } else {
        const password = generateTemporaryLoginPassword();
        user.password = await bcrypt.hash(password, 10);
        user.loginPassword = encryptPassword(password);
        await user.save();

        const mailResult = await this.mailer.sendFrisAccessCredentialsEmail({
          to: toEmail,
          employeeName: String(user.name ?? '').trim() || undefined,
          employeeId,
          password,
          company: String(user.company ?? '').trim() || undefined,
          loginUrl: this.getFrontendBaseUrl(),
        });
        credentialsEmailSent = mailResult.sent;
        credentialsEmailError = mailResult.sent ? undefined : mailResult.error;
      }
    }

    return {
      success: true,
      data: {
        userId: String(user._id),
        accountStatus: user.accountStatus,
        admNumber: user.admNumber,
        credentialsEmailSent,
        credentialsEmailError,
      },
    };
  }

  async rejectUser(
    body: RejectRegisteredUserDto,
    admin?: { name?: string; email?: string },
  ) {
    const user = await this.userModel.findById(body.userId).exec();
    if (!user) throw new NotFoundException('User not found');

    user.isActive = false;
    user.accountStatus = 'rejected';
    user.approvalStatus = 'rejected';
    user.registrationStatus = 'rejected';
    user.status = 'Rejected';
    user.rejectionReason = body.reason?.trim();
    user.rejectedAt = new Date();
    user.inviteStatus = 'rejected';
    user.tokenVersion = nextTokenVersion(user.tokenVersion);

    this.appendActivity(user, {
      action: 'registration.rejected',
      actorLabel: admin?.name || admin?.email || 'Admin',
      metadata: { reason: body.reason },
    });
    await user.save();

    return {
      success: true,
      data: { userId: String(user._id), accountStatus: user.accountStatus },
    };
  }
}
