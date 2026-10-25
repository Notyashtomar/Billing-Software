import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMinSize,
  Matches,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PRICE_CARD_REFERENCE_CODES } from '../shared/price-card-references';
import {
  CONTRACT_CLAUSE_APPLIES_TO,
  CONTRACT_CLAUSE_TYPES,
} from '../shared/contract-clauses';

const PRICE_CARD_REFERENCE_INPUT_CODES = [
  ...PRICE_CARD_REFERENCE_CODES,
  'PTW',
] as const;

export class BhsVolumeBandDto {
  @IsInt()
  @Min(1)
  fromCount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  toCount?: number | null;

  @IsNumber()
  @Min(0)
  unitPriceINR: number;
}

export class BhsVolumeScheduleDto {
  @IsIn(['comprehensive', 'ramp'])
  chargeKind: 'comprehensive' | 'ramp';

  @IsIn([
    'domestic_t1',
    'domestic_t2',
    'international',
    'charter_domestic',
    'charter_international',
  ])
  flightScope: string;

  @IsOptional()
  @IsIn(['any', 'passenger', 'freighter', 'cargo'])
  carrierKind?: 'any' | 'passenger' | 'freighter' | 'cargo';

  @IsIn(['marginal', 'flat'])
  allocation: 'marginal' | 'flat';

  @IsOptional()
  @IsBoolean()
  overridesSavedRate?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BhsVolumeBandDto)
  bands: BhsVolumeBandDto[];
}

export class ContractClauseDto {
  @IsString()
  @IsIn([...CONTRACT_CLAUSE_TYPES])
  clauseType: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  body: string;

  @IsArray()
  @IsString({ each: true })
  @IsIn([...CONTRACT_CLAUSE_APPLIES_TO], { each: true })
  appliesTo: string[];
}

/** Per-equipment ADS rule on a contract (free per flight + rates). */
export class ContractAdsEquipmentRuleDto {
  @IsString()
  serviceCode: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freePerFlight?: number;

  /** Wheelchair FOC for narrow-body flights. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  freePerFlightNb?: number;

  /** Wheelchair FOC for wide-body flights. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  freePerFlightWb?: number;

  @IsOptional()
  @IsBoolean()
  alwaysChargeable?: boolean;

  /**
   * When false, equipment is never charged on ADS for selected aircraft.
   * Default / omitted = true (included for ADS).
   */
  @IsOptional()
  @IsBoolean()
  includedForAds?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceINR?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceUSD?: number;

  @IsOptional()
  @IsString()
  uom?: string;

  /** @deprecated Prefer aircraftTypes — single aircraft kept for older payloads. */
  @IsOptional()
  @IsString()
  aircraftType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aircraftTypes?: string[];

  /** `YYYY-MM` — ADS rates apply per calendar month of the flight STA. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'effectiveMonth must be YYYY-MM' })
  effectiveMonth?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ContractConcessionRatesDto {
  @IsOptional()
  @IsNumber()
  int?: number;

  @IsOptional()
  @IsNumber()
  dom?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  divertedDom?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  divertedInt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  returnToRamp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cancellationWithinHoursPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  technicalHandlingChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  standbyChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  filoLifoChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  filoChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lifoChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ronAdditionalPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lateArrivalAdditionalPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  extraGroundTimeAdditionalPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  delayChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  domesticCargo?: number;

  @IsOptional()
  @IsNumber()
  internationalCargo?: number;
}

export class ContractConditionalChargesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  divertedDom?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  divertedInt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  returnToRamp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  originateTerminatePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cancellationWithinHoursPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  technicalHandlingChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  standbyChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  filoLifoChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  filoChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lifoChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ronAdditionalPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lateArrivalAdditionalPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  extraGroundTimeAdditionalPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  delayChargesPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  splitIntArrivalDomDeparturePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  splitDomArrivalIntDeparturePercent?: number;
}

export class ContractFortnightMonthRatePartDto {
  @IsInt()
  @Min(1)
  @Max(31)
  startDay: number;

  @IsNumber()
  @Min(0.0001)
  exchangeRatePerUsd: number;
}

export class ContractFortnightMonthRateDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFortnightMonthRatePartDto)
  parts: ContractFortnightMonthRatePartDto[];
}

export class ContractFortnightBillingRangeDto {
  @IsInt()
  @Min(1)
  @Max(31)
  startDay: number;

  @IsInt()
  @Min(1)
  @Max(31)
  endDay: number;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRatePerUsd?: number;
}

export class AdditionalCustomerInheritDto {
  @IsString()
  customerCode: string;

  @IsOptional()
  @IsBoolean()
  concessions?: boolean;

  @IsOptional()
  @IsBoolean()
  rateCards?: boolean;

  @IsOptional()
  @IsBoolean()
  contract?: boolean;

  @IsOptional()
  @IsBoolean()
  conversionRates?: boolean;

  @IsOptional()
  @IsBoolean()
  customer?: boolean;
}

export class CreateBillingContractDto {
  @IsString()
  contractNumber: string;

  @IsString()
  customerCode: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalCustomerCodes?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalCustomerInheritDto)
  additionalCustomerInherit?: AdditionalCustomerInheritDto[];

  @IsEnum(['Dom', 'Int', 'Both'])
  category: 'Dom' | 'Int' | 'Both';

  @IsOptional()
  @IsArray()
  @IsIn(['Dom', 'Int', 'DomCargo', 'IntCargo'], { each: true })
  categories?: Array<'Dom' | 'Int' | 'DomCargo' | 'IntCargo'>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aircraftTypes?: string[];

  @IsDateString()
  priceValidFrom: string;

  @IsDateString()
  priceValidTo: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationWithinHours?: number;

  @IsOptional()
  @IsNumber()
  royaltyAtGross?: number;

  @IsOptional()
  @IsBoolean()
  royaltyInclusive?: boolean;

  @IsOptional()
  @IsIn(['comprehensive', 'non_comprehensive', 'mixed'])
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed';

  @IsOptional()
  @IsBoolean()
  extendedRoyaltyEnabled?: boolean;

  @IsOptional()
  @IsString()
  bhsConcessionNote?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContractConcessionRatesDto)
  concessionRates?: ContractConcessionRatesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContractConditionalChargesDto)
  conditionalCharges?: ContractConditionalChargesDto;

  @IsOptional()
  @IsBoolean()
  fortnightBillingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  fortnightEdgeDayCap?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(31)
  fortnightBillingPartCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFortnightBillingRangeDto)
  fortnightBillingRanges?: ContractFortnightBillingRangeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFortnightMonthRateDto)
  fortnightBillingMonthRates?: ContractFortnightMonthRateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BhsVolumeScheduleDto)
  bhsVolumeSchedules?: BhsVolumeScheduleDto[];

  @IsOptional()
  @IsString()
  xxlnClause?: string;

  @IsOptional()
  @IsString()
  delayClause?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractClauseDto)
  clauses?: ContractClauseDto[];

  @IsOptional()
  @IsBoolean()
  adsBillingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  billBmeEquipment?: boolean;

  @IsOptional()
  @IsBoolean()
  inrUsdInvoiceEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(['BHS', 'ADS', 'RAF', 'MAAS', 'CUSTOM'], { each: true })
  inrUsdInvoiceCategories?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractAdsEquipmentRuleDto)
  adsEquipmentRules?: ContractAdsEquipmentRuleDto[];

  @IsOptional()
  @IsString()
  contractPdfFileName?: string;

  @IsOptional()
  @IsString()
  contractPdfContentType?: string;

  @IsOptional()
  @IsString()
  contractPdfBase64?: string;

  @IsOptional()
  @IsDateString()
  contractPdfUploadedAt?: string;
}

export class UpdateBillingContractDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalCustomerCodes?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalCustomerInheritDto)
  additionalCustomerInherit?: AdditionalCustomerInheritDto[];

  @IsOptional()
  @IsEnum(['Dom', 'Int', 'Both'])
  category?: 'Dom' | 'Int' | 'Both';

  @IsOptional()
  @IsArray()
  @IsIn(['Dom', 'Int', 'DomCargo', 'IntCargo'], { each: true })
  categories?: Array<'Dom' | 'Int' | 'DomCargo' | 'IntCargo'>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aircraftTypes?: string[];

  @IsOptional()
  @IsDateString()
  priceValidFrom?: string;

  @IsOptional()
  @IsDateString()
  priceValidTo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationWithinHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ceilingRatePerFlightINR?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ceilingRatePerFlightUSD?: number | null;

  @IsOptional()
  @IsNumber()
  royaltyAtGross?: number;

  @IsOptional()
  @IsBoolean()
  royaltyInclusive?: boolean;

  @IsOptional()
  @IsIn(['comprehensive', 'non_comprehensive', 'mixed'])
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed';

  @IsOptional()
  @IsBoolean()
  extendedRoyaltyEnabled?: boolean;

  @IsOptional()
  @IsString()
  bhsConcessionNote?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContractConcessionRatesDto)
  concessionRates?: ContractConcessionRatesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContractConditionalChargesDto)
  conditionalCharges?: ContractConditionalChargesDto;

  @IsOptional()
  @IsBoolean()
  fortnightBillingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  fortnightEdgeDayCap?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(31)
  fortnightBillingPartCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFortnightBillingRangeDto)
  fortnightBillingRanges?: ContractFortnightBillingRangeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFortnightMonthRateDto)
  fortnightBillingMonthRates?: ContractFortnightMonthRateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BhsVolumeScheduleDto)
  bhsVolumeSchedules?: BhsVolumeScheduleDto[];

  @IsOptional()
  @IsString()
  xxlnClause?: string;

  @IsOptional()
  @IsString()
  delayClause?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractClauseDto)
  clauses?: ContractClauseDto[];

  @IsOptional()
  @IsBoolean()
  adsBillingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  billBmeEquipment?: boolean;

  @IsOptional()
  @IsBoolean()
  inrUsdInvoiceEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(['BHS', 'ADS', 'RAF', 'MAAS', 'CUSTOM'], { each: true })
  inrUsdInvoiceCategories?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractAdsEquipmentRuleDto)
  adsEquipmentRules?: ContractAdsEquipmentRuleDto[];

  @IsOptional()
  @IsString()
  contractPdfFileName?: string;

  @IsOptional()
  @IsString()
  contractPdfContentType?: string;

  @IsOptional()
  @IsString()
  contractPdfBase64?: string;

  @IsOptional()
  @IsDateString()
  contractPdfUploadedAt?: string;

  @IsOptional()
  @IsEnum(['draft', 'active', 'expired'])
  status?: 'draft' | 'active' | 'expired';
}

export class CreateBillingRateCardDto {
  @IsString()
  contractId: string;

  @IsString()
  customerCode: string;

  @IsString()
  serviceCode: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  aircraftType?: string;

  @IsString()
  @IsIn([...PRICE_CARD_REFERENCE_INPUT_CODES])
  billingReference: string;

  @IsOptional()
  @IsNumber()
  unitPriceINR?: number;

  @IsOptional()
  @IsNumber()
  unitPriceUSD?: number;

  @IsOptional()
  @IsNumber()
  ceilingRateINR?: number;

  @IsOptional()
  @IsNumber()
  ceilingRateUSD?: number;

  @IsEnum(['INR', 'USD'])
  currency: 'INR' | 'USD';

  @IsString()
  uom: string;

  @IsOptional()
  @IsNumber()
  minBillableUnits?: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsEnum(['inclusive', 'exclusive'])
  billingScope?: 'inclusive' | 'exclusive';

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceCount?: number;

  @IsOptional()
  @IsBoolean()
  alwaysChargeable?: boolean;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validTo: string;
}

export class UpdateBillingRateCardDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  aircraftType?: string;

  @IsOptional()
  @IsString()
  @IsIn([...PRICE_CARD_REFERENCE_INPUT_CODES])
  billingReference?: string;

  @IsOptional()
  @IsNumber()
  unitPriceINR?: number;

  @IsOptional()
  @IsNumber()
  unitPriceUSD?: number;

  @IsOptional()
  @IsNumber()
  ceilingRateINR?: number;

  @IsOptional()
  @IsNumber()
  ceilingRateUSD?: number;

  @IsOptional()
  @IsEnum(['INR', 'USD'])
  currency?: 'INR' | 'USD';

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsNumber()
  minBillableUnits?: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsEnum(['inclusive', 'exclusive'])
  billingScope?: 'inclusive' | 'exclusive';

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceCount?: number;

  @IsOptional()
  @IsBoolean()
  alwaysChargeable?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class MatchRateCardQueryDto {
  @IsString()
  customerCode: string;

  @IsString()
  serviceCode: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class BulkDeleteByIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];
}
