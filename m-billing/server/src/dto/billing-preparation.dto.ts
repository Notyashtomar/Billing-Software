import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PREPARATION_STATUSES } from '../shared/enums';

export class ListPreparationQueryDto {
  @IsOptional()
  @IsEnum(PREPARATION_STATUSES)
  status?: (typeof PREPARATION_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;

  /** Filter by preparation sourceType (e.g. custom). */
  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

class IngestSourceRefDto {
  @IsOptional()
  @IsString()
  serialNo?: string;

  @IsOptional()
  @IsString()
  flightNo?: string;

  @IsOptional()
  @IsString()
  usageRowId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;
}

class IngestMatchDto {
  @IsOptional()
  @IsBoolean()
  matched?: boolean;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  rateCardId?: string;

  @IsOptional()
  @IsString()
  serviceCode?: string;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsNumber()
  cancellationWithinHours?: number;

  @IsOptional()
  @IsNumber()
  royaltyAtGross?: number;

  @IsOptional()
  @IsObject()
  concessionRates?: Record<string, number>;

  /** ADS: units used in period (before free allowance). */
  @IsOptional()
  @IsNumber()
  usedUnits?: number;

  /** ADS: free units per serviceCount (Particular + Aircraft Type). */
  @IsOptional()
  @IsNumber()
  freeAllowance?: number;

  @IsOptional()
  @IsString()
  pricingBasis?: string;

  @IsOptional()
  @IsString()
  particular?: string;

  @IsOptional()
  @IsString()
  aircraftType?: string;

  @IsOptional()
  @IsString()
  uom?: string;
}

class IngestValidationRuleDto {
  @IsString()
  rule: string;

  @IsBoolean()
  passed: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}

class IngestValidationStatusDto {
  @IsOptional()
  @IsBoolean()
  passed?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestValidationRuleDto)
  errors?: IngestValidationRuleDto[];
}

class IngestSourceRowDto {
  @IsString()
  sourceType: string;

  @ValidateNested()
  @Type(() => IngestSourceRefDto)
  sourceRef: IngestSourceRefDto;

  @IsObject()
  operationalData: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => IngestMatchDto)
  contractMatch?: IngestMatchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => IngestMatchDto)
  rateMatch?: IngestMatchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => IngestValidationStatusDto)
  validationStatus?: IngestValidationStatusDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestValidationRuleDto)
  validationResults?: IngestValidationRuleDto[];
}

export class IngestPreparationDto {
  @IsDateString()
  billingPeriodStart: string;

  @IsDateString()
  billingPeriodEnd: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestSourceRowDto)
  rows: IngestSourceRowDto[];
}

export class BulkReadyPreparationDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

/** Mark every preparation row matching the current tab filters ready. */
export class BulkReadyByFilterPreparationDto {
  @IsIn(['pending', 'eligible', 'validation_error'])
  status: 'pending' | 'eligible' | 'validation_error';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;
}

export class BulkDeletePreparationDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

/** Delete every preparation row matching the current tab filters (select-all). */
export class BulkDeleteByFilterPreparationDto {
  @IsIn([
    'pending',
    'eligible',
    'validation_error',
    'rejected',
    'ready_for_invoice',
  ])
  status:
    | 'pending'
    | 'eligible'
    | 'validation_error'
    | 'rejected'
    | 'ready_for_invoice';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;
}

/** Remove ingested source rows from preparation (scheduled flights / ADS "unsend"). */
export class UnsendPreparationBySourceDto {
  @IsDateString()
  billingPeriodStart: string;

  /** Inclusive end of the source-page period. Rows are matched anywhere in this range. */
  @IsOptional()
  @IsDateString()
  billingPeriodEnd?: string;

  @IsString()
  sourceType: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNos?: string[];

  /** ADS / equipment / manpower line identity (preferred over serial for unsend). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usageRowIds?: string[];
}

export class RejectPreparationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class PreparationCustomCheckDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsBoolean()
  passed: boolean;
}

class PreparationCancellationBillingDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsNumber()
  bhsChargeablePercent?: number;
}

export class UpdatePreparationChecklistDto {
  @IsOptional()
  @IsObject()
  manualOverrides?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreparationCustomCheckDto)
  customChecks?: PreparationCustomCheckDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PreparationCancellationBillingDto)
  cancellationBilling?: PreparationCancellationBillingDto;
}

export class CustomBillingLineDto {
  @IsString()
  particular: string;

  @IsNumber()
  used: number;

  @IsNumber()
  charged: number;

  @IsOptional()
  @IsString()
  aircraftType?: string;

  @IsString()
  unit: string;

  @IsNumber()
  ratePerUnit: number;
}

export class UpdateCustomBillingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomBillingLineDto)
  lines: CustomBillingLineDto[];

  /** Optional fee concession % for this custom bill (0–100). */
  @IsOptional()
  @IsNumber()
  concessionPercent?: number;

  /** Optional USD→INR conversion rate override for generated invoice. */
  @IsOptional()
  @IsNumber()
  conversionRate?: number;
}

export class SubmitCustomBillingDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomBillingLineDto)
  lines?: CustomBillingLineDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preparationRecordIds?: string[];

  /** Standalone Custom tab (no flights): customer + billing period. */
  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsOptional()
  @IsString()
  billingPeriodStart?: string;

  @IsOptional()
  @IsString()
  billingPeriodEnd?: string;

  /** Optional fee concession % for this custom bill (0–100). */
  @IsOptional()
  @IsNumber()
  concessionPercent?: number;

  /** Optional USD→INR conversion rate override for generated invoice. */
  @IsOptional()
  @IsNumber()
  conversionRate?: number;

  /** Optional flight linkage (e.g. non-scheduled booking custom bill). */
  @IsOptional()
  @IsString()
  flightNo?: string;

  @IsOptional()
  @IsString()
  bookingNo?: string;

  @IsOptional()
  @IsString()
  registrationNo?: string;

  @IsOptional()
  @IsString()
  routing?: string;

  @IsOptional()
  @IsString()
  opsType?: string;

  @IsOptional()
  @IsString()
  aircraftType?: string;

  @IsOptional()
  @IsString()
  categoryOfFlight?: string;
}

export class SendBackPreparationDto {
  @IsEnum(['eligible', 'pending', 'validation_error'])
  targetStatus: 'eligible' | 'pending' | 'validation_error';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AddPreparationRemarkDto {
  @IsString()
  body: string;

  @IsEnum(['preparation', 'draft_invoicing', 'all'])
  audience: 'preparation' | 'draft_invoicing' | 'all';

  @IsOptional()
  @IsString()
  directedToUserId?: string;

  @IsOptional()
  @IsString()
  directedToUserName?: string;
}

export class AddDraftPreparationRemarkDto extends AddPreparationRemarkDto {
  @IsOptional()
  @IsString()
  preparationRecordId?: string;
}

export class CreateDraftsFromPreparationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preparationRecordIds?: string[];

  @IsOptional()
  @IsBoolean()
  groupByCustomer?: boolean;
}
