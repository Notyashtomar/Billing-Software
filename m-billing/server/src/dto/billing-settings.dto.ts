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

export class AirportCommercialRulesDto {
  @IsEnum(['private', 'aai'])
  ownership: 'private' | 'aai';

  @IsEnum(['gross', 'net'])
  revenueShareMechanism: 'gross' | 'net';

  @IsNumber()
  revenueSharePercent: number;

  @IsBoolean()
  minRevenueShareApplicable: boolean;

  @IsDateString()
  effectiveFrom: string;

  @IsDateString()
  effectiveTo: string;

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
}
