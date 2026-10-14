import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KYC_DOCUMENT_TYPES, KYC_STATUSES } from '../shared/enums';

export class CreateBillingKycCaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  customerCode: string;

  @IsOptional()
  @IsEmail()
  inviteEmail?: string;
}

export class ListBillingKycQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class UpdateBillingKycFormDto {
  @IsOptional()
  @IsObject()
  form?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(KYC_STATUSES)
  status?: (typeof KYC_STATUSES)[number];
}

export class SendBillingKycInviteDto {
  @IsEmail()
  email: string;
}

export class RejectBillingKycDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ApproveBillingKycDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  syncToCustomer?: boolean;
}

export class KycSoftGateOverrideDto {
  @IsOptional()
  @IsBoolean()
  kycOverride?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  kycOverrideReason?: string;
}

export class UploadBillingKycDocumentMetaDto {
  @IsEnum(KYC_DOCUMENT_TYPES)
  docType: (typeof KYC_DOCUMENT_TYPES)[number];
}
