import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class CompanyLegalEntityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  cin?: string;

  @IsOptional()
  @IsString()
  msme?: string;
}

export class BankDetailsDto {
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  ifscCode?: string;

  @IsOptional()
  @IsString()
  swiftCode?: string;

  @IsOptional()
  @IsString()
  chequePayableText?: string;
}

export class CreateTaxRuleDto {
  @IsString()
  ruleCode: string;

  @IsNumber()
  gstPercent: number;

  @IsEnum(['intra_state', 'inter_state'])
  placeOfSupply: 'intra_state' | 'inter_state';

  @IsDateString()
  effectiveFrom: string;

  @IsDateString()
  effectiveTo: string;
}

export class UpdateTaxRuleDto {
  @IsOptional()
  @IsNumber()
  gstPercent?: number;

  @IsOptional()
  @IsEnum(['intra_state', 'inter_state'])
  placeOfSupply?: 'intra_state' | 'inter_state';

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class CreateExchangeRateDto {
  @IsString()
  currencyCode: string;

  @IsNumber()
  rateToINR: number;

  /** ISO date (YYYY-MM-DD). Prefer yearMonth for month-wise master rates. */
  @IsOptional()
  @IsDateString()
  startingDate?: string;

  /** Billing month as YYYY-MM — stored as the 1st of that month. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  yearMonth?: string;

  @IsOptional()
  @IsEnum(['manual', 'rbi', 'import'])
  source?: 'manual' | 'rbi' | 'import';
}

export class UpdateExchangeRateDto {
  @IsOptional()
  @IsNumber()
  rateToINR?: number;

  @IsOptional()
  @IsEnum(['manual', 'rbi', 'import'])
  source?: 'manual' | 'rbi' | 'import';
}

export class EffectiveExchangeRateQueryDto {
  @IsString()
  currencyCode: string;

  @IsDateString()
  date: string;
}

export class CreateSequenceDto {
  @IsString()
  sequenceCode: string;

  @IsString()
  prefix: string;

  @IsString()
  fiscalYear: string;

  @IsEnum(['invoice', 'credit_memo'])
  documentType: 'invoice' | 'credit_memo';
}

export class UpdateSequenceDto {
  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsNumber()
  currentValue?: number;
}

export class AirportCeilingRateDto {
  @IsString()
  aircraftCode: string;

  @IsString()
  serviceType: string;

  @IsNumber()
  amount: number;
}

export class RoyaltyFeeDto {
  @IsNumber()
  percent: number;
}

/** Three concession fees on one royalty card, with one shared validity. */
export class RoyaltySideDto {
  @IsDateString()
  effectiveFrom: string;

  @IsDateString()
  effectiveTo: string;

  @ValidateNested()
  @Type(() => RoyaltyFeeDto)
  scheduledInternational: RoyaltyFeeDto;

  @ValidateNested()
  @Type(() => RoyaltyFeeDto)
  scheduledDomestic: RoyaltyFeeDto;

  @ValidateNested()
  @Type(() => RoyaltyFeeDto)
  generalAviation: RoyaltyFeeDto;
}

export class RoyaltyMasterDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RoyaltySideDto)
  net?: RoyaltySideDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoyaltySideDto)
  gross?: RoyaltySideDto;
}

export class AirportCommercialRulesDto {
  @IsEnum(['private', 'aai'])
  ownership: 'private' | 'aai';

  /** Private stations choose Royalty on Net or Royalty on Gross. Concession fees are set on Royalty Master. */
  @IsOptional()
  @IsEnum(['gross', 'net'])
  revenueShareMechanism?: 'gross' | 'net';

  @IsOptional()
  @IsNumber()
  revenueSharePercent?: number;

  @IsBoolean()
  minRevenueShareApplicable: boolean;

  @IsOptional()
  @IsEnum(['INR', 'USD', 'EUR'])
  magCurrency?: 'INR' | 'USD' | 'EUR';

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AirportCeilingRateDto)
  ceilingRates?: AirportCeilingRateDto[];
}

export class UpdateBillingSettingsDto {
  @IsOptional()
  @IsString()
  defaultPaymentTerms?: string;

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @IsOptional()
  @IsNumber()
  monthCloseLockDay?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{1,2}$/, { message: 'Station code must be 1–2 digits (GST state code)' })
  gstStateCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyLegalEntityDto)
  companyLegalEntity?: CompanyLegalEntityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AirportCommercialRulesDto)
  airportCommercial?: AirportCommercialRulesDto;

  /** Concession percentages saved from Royalty Master. Not used by invoice generation. */
  @IsOptional()
  @ValidateNested()
  @Type(() => RoyaltyMasterDto)
  royaltyMaster?: RoyaltyMasterDto;
}
