import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  Max,
  Min,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListInvoicesQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class CreateInvoiceDraftDto {
  @IsString()
  customerCode: string;

  @IsString()
  customerName: string;

  @IsDateString()
  billingPeriodStart: string;

  @IsDateString()
  billingPeriodEnd: string;

  @IsDateString()
  documentDate: string;

  @IsOptional()
  @IsEnum(['INR', 'USD'])
  currencyCode?: 'INR' | 'USD';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preparationRecordIds?: string[];
}

export class CreateDraftsFromPreparationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preparationRecordIds?: string[];

  @IsOptional()
  @IsBoolean()
  groupByCustomer?: boolean;

  /**
   * When true, append flights to an existing open draft for the same airline + period.
   * Default / preferred: false — each Create Invoice run makes a new draft (no merge).
   */
  @IsOptional()
  @IsBoolean()
  mergeOpenDraft?: boolean;

  @IsOptional()
  @IsDateString()
  billingPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  billingPeriodEnd?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsOptional()
  @IsDateString()
  documentDate?: string;
}

export class UpdateInvoiceDraftDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @IsOptional()
  @IsEnum(['INR', 'USD'])
  currencyCode?: 'INR' | 'USD';
}

export class SplitAdsInvoiceDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  lineNos: number[];
}

export class AddInvoiceLineDto {
  @IsString()
  serviceCode: string;

  @IsString()
  description: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsOptional()
  @IsString()
  uom?: string;
}

export class UpdateInvoiceLineDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  uom?: string;

  /** ADS / custom display — synced to line sourceRef when provided. */
  @IsOptional()
  @IsNumber()
  usedQuantity?: number;

  /** RAF draft editor: custom typed rate vs catalog adhoc row. */
  @IsOptional()
  @IsString()
  pricingBasis?: string;
}

export class UpdateInvoiceLineItemDto extends UpdateInvoiceLineDto {
  @IsInt()
  lineNo: number;
}

export class UpdateInvoiceLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateInvoiceLineItemDto)
  lines: UpdateInvoiceLineItemDto[];

  /** Invoice edit screen. Null clears the override and uses the contract percent. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  concessionPercent?: number | null;
}

/** Edit Custom Bills draft lines (particulars / used / charged / rate) then recompute. */
export class UpdateCustomInvoiceDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomInvoiceDraftLineDto)
  lines: CustomInvoiceDraftLineDto[];

  /** Optional fee concession % for this custom bill (0–100). */
  @IsOptional()
  @IsNumber()
  concessionPercent?: number;

  /** Optional USD→INR conversion rate override for generated invoice. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  conversionRate?: number | null;
}

export class CustomInvoiceDraftLineDto {
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

/** Per-line overrides when correcting a draft bill (BHS/ADS/RAF/CUSTOM). */
export class CustomBillLineOverrideDto {
  @IsInt()
  lineNo: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsString()
  particular?: string;

  @IsOptional()
  @IsNumber()
  used?: number;

  @IsOptional()
  @IsNumber()
  charged?: number;

  @IsOptional()
  @IsString()
  aircraftType?: string;

  @IsOptional()
  @IsNumber()
  ratePerUnit?: number;
}

/** Correct bill-to, tax identifiers, location, and line particulars on an open draft. */
export class UpdateCustomBillDraftDto {
  @IsOptional()
  @IsString()
  billToName?: string;

  @IsOptional()
  @IsString()
  billToAddress?: string;

  @IsOptional()
  @IsString()
  billToGstin?: string;

  @IsOptional()
  @IsString()
  billToPan?: string;

  @IsOptional()
  @IsString()
  billToStateCode?: string;

  @IsOptional()
  @IsString()
  placeOfSupply?: string;

  @IsOptional()
  @IsString()
  serviceStation?: string;

  @IsOptional()
  @IsString()
  serviceTableTitle?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomBillLineOverrideDto)
  lines?: CustomBillLineOverrideDto[];

  @IsOptional()
  @IsNumber()
  concessionPercent?: number;
}

export class PostInvoiceDto {
  @IsDateString()
  postingDate: string;

  @IsOptional()
  @IsString()
  sequenceCode?: string;

  @IsOptional()
  @IsString()
  fiscalYear?: string;
}

export class SendInvoicesToAirlineDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

export class RejectReviewDto {
  @IsString()
  reason: string;
}

export class CreateCreditMemoDto {
  @IsString()
  customerCode: string;

  @IsString()
  appliesToInvoiceId: string;

  @IsEnum(['xxld_not_chargeable', 'delay_dispute', 'correction', 'other'])
  reason: string;

  @IsDateString()
  documentDate: string;

  @IsOptional()
  @IsArray()
  lines?: Array<Record<string, unknown>>;
}

export class GenerateReportDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  customerCode?: string;
}

export class ListAuditQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class BulkDeleteInvoicesDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

export class MergeInvoiceDraftsDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  ids: string[];
}
