import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMinSize,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Correspondent / intermediary bank printed under the station account when enabled. */
export class IntermediaryAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  branchAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  swiftCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ifscCode?: string;
}

const PRICE_CARD_HANDLING_TYPES = ['BHS', 'ADS', 'RAF'] as const;
type PriceCardHandlingType = (typeof PRICE_CARD_HANDLING_TYPES)[number];

export class CreateBillingCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  customerCode: string;

  @IsString()
  @MinLength(1)
  name: string;

  /** Name printed under Bill to on the invoice. Optional. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  airlineInvoiceName?: string;

  @IsOptional()
  @IsString()
  billToCustomerCode?: string;

  @IsEnum(['INR', 'USD'])
  currencyCode: 'INR' | 'USD';

  @IsOptional()
  @IsString()
  paymentTermsCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  invoiceTerms?: string;

  @IsOptional()
  @IsString()
  gstRegistrationNo?: string;

  @IsOptional()
  @IsString()
  msmeRegistrationNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  flightNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aircraftType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;

  @IsOptional()
  @IsBoolean()
  secondaryAddressEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  secondaryAddress?: string;

  @IsOptional()
  @IsBoolean()
  blocked?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** When true, print customer PAN on invoices (default off). */
  @IsOptional()
  @IsBoolean()
  showPanOnInvoice?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  panNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  msmeNumber?: string;

  /** When true, print customer VAT number on invoices (default off). */
  @IsOptional()
  @IsBoolean()
  showVatOnInvoice?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatNumber?: string;

  /** When true, print the intermediary account on this airline's invoices. */
  @IsOptional()
  @IsBoolean()
  intermediaryAccountEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => IntermediaryAccountDto)
  intermediaryAccount?: IntermediaryAccountDto;

  @IsOptional()
  @IsNumber()
  creditLimit?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(PRICE_CARD_HANDLING_TYPES, { each: true })
  priceCardHandlingTypes?: PriceCardHandlingType[];
}

export class UpdateBillingCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  customerCode?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  airlineInvoiceName?: string;

  @IsOptional()
  @IsEnum(['INR', 'USD'])
  currencyCode?: 'INR' | 'USD';

  @IsOptional()
  @IsString()
  paymentTermsCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  invoiceTerms?: string;

  @IsOptional()
  @IsString()
  gstRegistrationNo?: string;

  @IsOptional()
  @IsString()
  msmeRegistrationNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  flightNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aircraftType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;

  @IsOptional()
  @IsBoolean()
  secondaryAddressEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  secondaryAddress?: string;

  @IsOptional()
  @IsString()
  billToCustomerCode?: string;

  @IsOptional()
  @IsBoolean()
  blocked?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** When true, print customer PAN on invoices (default off). */
  @IsOptional()
  @IsBoolean()
  showPanOnInvoice?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  panNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  msmeNumber?: string;

  /** When true, print customer VAT number on invoices (default off). */
  @IsOptional()
  @IsBoolean()
  showVatOnInvoice?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatNumber?: string;

  /** When true, print the intermediary account on this airline's invoices. */
  @IsOptional()
  @IsBoolean()
  intermediaryAccountEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => IntermediaryAccountDto)
  intermediaryAccount?: IntermediaryAccountDto;

  @IsOptional()
  @IsArray()
  @IsEnum(PRICE_CARD_HANDLING_TYPES, { each: true })
  priceCardHandlingTypes?: PriceCardHandlingType[];
}

export class ListBillingCustomersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  /** `true` (default) | `false` | `all` — ADS dropdowns use `all` so deactivated airlines still filter. */
  @IsOptional()
  @IsString()
  active?: string;
}

export class BulkDeleteBillingCustomersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];
}
