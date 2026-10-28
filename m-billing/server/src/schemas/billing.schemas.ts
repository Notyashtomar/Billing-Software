import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BillingDocType } from './billing-collection.constants';

export type BillingCustomerDocument = BillingCustomer & Document;

@Schema()
export class BillingCustomer {
  @Prop({ required: true, uppercase: true, trim: true })
  customerCode: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Printed on the invoice Bill to line. Falls back to `name` when blank. */
  @Prop({ trim: true })
  airlineInvoiceName?: string;

  @Prop({ trim: true })
  billToCustomerCode?: string;

  @Prop({ required: true, enum: ['INR', 'USD'], default: 'INR' })
  currencyCode: string;

  @Prop({ trim: true })
  paymentTermsCode?: string;

  /** Invoice terms for this customer at this station. Not shared with other stations. */
  @Prop({ trim: true })
  invoiceTerms?: string;

  @Prop({ trim: true })
  gstRegistrationNo?: string;

  @Prop({ trim: true })
  msmeRegistrationNo?: string;

  @Prop({ trim: true })
  address?: string;

  /** When true, print `secondaryAddress` under the first bill-to address. */
  @Prop({ default: false })
  secondaryAddressEnabled?: boolean;

  @Prop({ trim: true })
  secondaryAddress?: string;

  @Prop({ trim: true })
  gstBusPostingGroup?: string;

  @Prop({ trim: true })
  genBusPostingGroup?: string;

  @Prop({ default: false })
  blocked: boolean;

  @Prop()
  creditLimit?: number;

  @Prop({ trim: true })
  globalDimension1?: string;

  @Prop({ trim: true })
  globalDimension2?: string;

  @Prop({ required: true, trim: true })
  stationCode: string;

  @Prop({ type: Types.ObjectId })
  advanceAirlineId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  gatewayScheduledAirlineId?: Types.ObjectId;

  @Prop({ trim: true })
  flightNumber?: string;

  @Prop({ trim: true })
  aircraftType?: string;

  @Prop({
    type: [{ flightNumber: { type: String, trim: true }, aircraftType: { type: String, trim: true } }],
    default: [],
  })
  scheduleLines?: Array<{ flightNumber: string; aircraftType?: string }>;

  @Prop({ type: [String], enum: ['BHS', 'ADS', 'RAF'], default: [] })
  priceCardHandlingTypes?: Array<'BHS' | 'ADS' | 'RAF'>;

  /**
   * When true, print customer PAN on tax invoices.
   * Default false — PAN stays blank until finance enables it per airline.
   */
  @Prop({ default: false })
  showPanOnInvoice?: boolean;

  /** Stored PAN printed when showPanOnInvoice is on. Falls back to the GSTIN slice. */
  @Prop({ trim: true, uppercase: true })
  panNumber?: string;

  /** Customer's MSME / Udyam registration number, printed on invoices. */
  @Prop({ trim: true, uppercase: true })
  msmeNumber?: string;

  /** When true, print customer VAT number on tax invoices. Default false. */
  @Prop({ default: false })
  showVatOnInvoice?: boolean;

  /** Stored VAT number printed when showVatOnInvoice is on. */
  @Prop({ trim: true, uppercase: true })
  vatNumber?: string;

  /** Airline annexure PDFs, one file each for ADS and BHS invoices. */
  @Prop({
    type: {
      ads: {
        fileKey: { type: String, trim: true },
        originalName: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        uploadedAt: { type: Date },
      },
      bhs: {
        fileKey: { type: String, trim: true },
        originalName: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        uploadedAt: { type: Date },
      },
    },
  })
  annexures?: {
    ads?: {
      fileKey: string;
      originalName: string;
      mimeType?: string;
      uploadedAt?: Date;
    };
    bhs?: {
      fileKey: string;
      originalName: string;
      mimeType?: string;
      uploadedAt?: Date;
    };
  };

  @Prop({ default: true })
  active: boolean;
}

export const BillingCustomerSchema = SchemaFactory.createForClass(BillingCustomer);
BillingCustomerSchema.index(
  { stationCode: 1, customerCode: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.Customer } },
);
BillingCustomerSchema.index({ stationCode: 1, name: 1 });

export type BillingServiceCatalogDocument = BillingServiceCatalog & Document;

@Schema()
export class BillingServiceCatalog {
  @Prop({ required: true, trim: true })
  serviceCode: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, enum: ['service', 'adjustment'], default: 'service' })
  lineType: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true, default: 'FLIGHT' })
  uom: string;

  @Prop()
  gstProdPostingGroup?: string;

  @Prop()
  sacCode?: string;

  @Prop({ default: false })
  royaltyApplicable: boolean;

  @Prop({ default: true })
  active: boolean;

  @Prop()
  exportLogType?: string;

  @Prop({ required: true, trim: true, uppercase: true })
  stationCode: string;
}

export const BillingServiceCatalogSchema =
  SchemaFactory.createForClass(BillingServiceCatalog);
BillingServiceCatalogSchema.index(
  { stationCode: 1, serviceCode: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.ServiceCatalog } },
);
BillingServiceCatalogSchema.index({ category: 1, active: 1 });
BillingServiceCatalogSchema.index({ exportLogType: 1 }, { sparse: true });

export type BillingContractDocument = BillingContract & Document;

@Schema()
export class BillingContract {
  @Prop({ required: true, trim: true })
  contractNumber: string;

  @Prop({ required: true, uppercase: true, trim: true })
  customerCode: string;

  /** Other airlines billed on this contract. Primary customerCode stays the card owner. */
  @Prop({ type: [String], default: [] })
  additionalCustomerCodes?: string[];

  /** Which primary-customer masters each added airline inherits. Missing keys stay off. */
  @Prop({
    type: [
      {
        customerCode: { type: String, required: true, uppercase: true, trim: true },
        concessions: { type: Boolean, default: false },
        rateCards: { type: Boolean, default: false },
        contract: { type: Boolean, default: false },
        conversionRates: { type: Boolean, default: false },
        customer: { type: Boolean, default: false },
      },
    ],
    default: [],
  })
  additionalCustomerInherit?: Array<{
    customerCode: string;
    concessions: boolean;
    rateCards: boolean;
    contract: boolean;
    conversionRates: boolean;
    customer: boolean;
  }>;

  @Prop({ required: true, trim: true })
  stationCode: string;

  @Prop({ required: true, enum: ['Dom', 'Int', 'Both'] })
  category: string;

  /**
   * Flight sectors this contract bills. Empty means the legacy `category` value.
   * DomCargo / IntCargo are cargo only and do not include passenger flights.
   */
  @Prop({ type: [String], default: [] })
  categories?: Array<'Dom' | 'Int' | 'DomCargo' | 'IntCargo'>;

  @Prop({ type: [String], default: [] })
  aircraftTypes: string[];

  @Prop({ required: true })
  priceValidFrom: Date;

  @Prop({ required: true })
  priceValidTo: Date;

  /** Sheet says the rate continues until further notice. The stored end date is only for lookups. */
  @Prop({ default: false })
  openEnded?: boolean;

  /**
   * Fixed charge added once per scheduled flight on the airline invoice.
   * Set from Concessions. Zero or empty means the airline has no ceiling charge.
   */
  @Prop()
  ceilingRatePerFlightINR?: number;

  @Prop()
  ceilingRatePerFlightUSD?: number;

  @Prop()
  royaltyAtGross?: number;

  @Prop()
  royaltyInclusive?: boolean;

  /**
   * How concession sits against the BHS package.
   * comprehensive — already inside the package
   * non_comprehensive — charged separately on the airline invoice
   * mixed — scheduled and non-scheduled treatment differ
   */
  @Prop({ enum: ['comprehensive', 'non_comprehensive', 'mixed'] })
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed';

  /** Exclusive contracts only: royalty = amount × p/(100−p) using this contract's saved concession %. */
  @Prop({ default: false })
  extendedRoyaltyEnabled?: boolean;

  /** Print USD invoices with an INR column. Off leaves the existing one-currency invoice. */
  @Prop({ default: false })
  inrUsdInvoiceEnabled?: boolean;

  /** Invoice categories that use the INR + USD layout. Empty while the option is off. */
  @Prop({ type: [String], default: [] })
  inrUsdInvoiceCategories?: string[];

  @Prop()
  bhsConcessionNote?: string;

  @Prop({
    type: {
      int: { type: Number },
      dom: { type: Number },
      divertedDom: { type: Number },
      divertedInt: { type: Number },
      returnToRamp: { type: Number },
      cancellationWithinHoursPercent: { type: Number },
      technicalHandlingChargesPercent: { type: Number },
      standbyChargesPercent: { type: Number },
      filoLifoChargesPercent: { type: Number },
      filoChargesPercent: { type: Number },
      lifoChargesPercent: { type: Number },
      ronAdditionalPercent: { type: Number },
      lateArrivalAdditionalPercent: { type: Number },
      extraGroundTimeAdditionalPercent: { type: Number },
      delayChargesPercent: { type: Number },
      domesticCargo: { type: Number },
      internationalCargo: { type: Number },
    },
  })
  /** Concessions-page fee % — additive after Total Amount by flight scenario. */
  concessionRates?: {
    int?: number;
    dom?: number;
    divertedDom?: number;
    divertedInt?: number;
    returnToRamp?: number;
    cancellationWithinHoursPercent?: number;
    technicalHandlingChargesPercent?: number;
    standbyChargesPercent?: number;
    filoLifoChargesPercent?: number;
    filoChargesPercent?: number;
    lifoChargesPercent?: number;
    ronAdditionalPercent?: number;
    lateArrivalAdditionalPercent?: number;
    extraGroundTimeAdditionalPercent?: number;
    delayChargesPercent?: number;
    domesticCargo?: number;
    internationalCargo?: number;
  };

  @Prop({
    type: {
      divertedDom: { type: Number },
      divertedInt: { type: Number },
      returnToRamp: { type: Number },
      originateTerminatePercent: { type: Number },
      cancellationWithinHoursPercent: { type: Number },
      technicalHandlingChargesPercent: { type: Number },
      standbyChargesPercent: { type: Number },
      filoLifoChargesPercent: { type: Number },
      filoChargesPercent: { type: Number },
      lifoChargesPercent: { type: Number },
      ronAdditionalPercent: { type: Number },
      lateArrivalAdditionalPercent: { type: Number },
      extraGroundTimeAdditionalPercent: { type: Number },
      delayChargesPercent: { type: Number },
      splitIntArrivalDomDeparturePercent: { type: Number },
      splitDomArrivalIntDeparturePercent: { type: Number },
    },
  })
  /** Contracts-page conditional charges — chargeable % of BHS package rate. */
  conditionalCharges?: {
    divertedDom?: number;
    divertedInt?: number;
    returnToRamp?: number;
    originateTerminatePercent?: number;
    cancellationWithinHoursPercent?: number;
    technicalHandlingChargesPercent?: number;
    standbyChargesPercent?: number;
    filoLifoChargesPercent?: number;
    filoChargesPercent?: number;
    lifoChargesPercent?: number;
    ronAdditionalPercent?: number;
    lateArrivalAdditionalPercent?: number;
    extraGroundTimeAdditionalPercent?: number;
    delayChargesPercent?: number;
    splitIntArrivalDomDeparturePercent?: number;
    splitDomArrivalIntDeparturePercent?: number;
  };

  /** Split monthly billing into multiple date-window invoices for this contract. */
  @Prop({ default: false })
  fortnightBillingEnabled?: boolean;

  /** 1 Sep counts in the previous month’s last part; month-end counts in the next month’s first part. */
  @Prop({ default: false })
  fortnightEdgeDayCap?: boolean;

  @Prop()
  fortnightBillingPartCount?: number;

  @Prop({
    type: [
      {
        startDay: { type: Number, required: true },
        endDay: { type: Number, required: true },
        exchangeRatePerUsd: { type: Number },
      },
    ],
    default: [],
  })
  fortnightBillingRanges?: Array<{
    startDay: number;
    endDay: number;
    exchangeRatePerUsd?: number;
  }>;

  /** USD→INR rate for each part, stored per calendar month (`YYYY-MM`). */
  @Prop({
    type: [
      {
        month: { type: String, required: true },
        parts: {
          type: [
            {
              startDay: { type: Number, required: true },
              exchangeRatePerUsd: { type: Number, required: true },
            },
          ],
          default: [],
        },
      },
    ],
    default: [],
  })
  fortnightBillingMonthRates?: Array<{
    month: string;
    parts: Array<{ startDay: number; exchangeRatePerUsd: number }>;
  }>;

  @Prop()
  cancellationWithinHours?: number;

  @Prop()
  xxlnClause?: string;

  @Prop()
  delayClause?: string;

  /**
   * Comprehensive (BHS) volume bands. When set, invoice generation replaces the
   * saved price-card rate for matching flights. Marginal bands fill in order.
   */
  @Prop({
    type: [
      {
        chargeKind: { type: String, enum: ['comprehensive', 'ramp'], required: true },
        flightScope: { type: String, required: true },
        carrierKind: { type: String, enum: ['any', 'passenger', 'freighter', 'cargo'] },
        allocation: { type: String, enum: ['marginal', 'flat'], required: true },
        overridesSavedRate: { type: Boolean, default: true },
        effectiveFrom: { type: String },
        effectiveTo: { type: String },
        label: { type: String },
        note: { type: String },
        bands: {
          type: [
            {
              fromCount: { type: Number, required: true },
              toCount: { type: Number },
              unitPriceINR: { type: Number, required: true },
            },
          ],
          default: [],
        },
      },
    ],
    default: [],
  })
  bhsVolumeSchedules?: Array<{
    chargeKind: 'comprehensive' | 'ramp';
    flightScope: string;
    carrierKind?: 'any' | 'passenger' | 'freighter' | 'cargo';
    allocation: 'marginal' | 'flat';
    overridesSavedRate?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string;
    label?: string;
    note?: string;
    bands: Array<{ fromCount: number; toCount?: number | null; unitPriceINR: number }>;
  }>;

  /** Price-card clause rows — scoped to equipment, CAP, scheduled, etc. */
  @Prop({
    type: [
      {
        clauseType: { type: String, required: true },
        label: { type: String },
        body: { type: String, required: true },
        appliesTo: { type: [String], default: [] },
      },
    ],
    default: [],
  })
  clauses?: Array<{
    clauseType: string;
    label?: string;
    body: string;
    appliesTo: string[];
  }>;

  /** When true, ADS equipment rules on this contract drive per-flight ADS billing. */
  @Prop({ default: false })
  adsBillingEnabled?: boolean;

  /**
   * When true, BME equipment (GPU/ACU/Water Cart with a BME suffix) is eligible
   * for ADS invoices. Off by default — those lines stay in flight data only.
   */
  @Prop({ default: false })
  billBmeEquipment?: boolean;

  /**
   * ADS conditions — free units per flight, always-chargeable flags, and unit rates.
   * Synced to inclusive/exclusive rate cards for the same airline × aircraft × category.
   */
  @Prop({
    type: [
      {
        serviceCode: { type: String, required: true },
        freePerFlight: { type: Number },
        freePerFlightNb: { type: Number },
        freePerFlightWb: { type: Number },
        alwaysChargeable: { type: Boolean, default: false },
        /** false = never ADS-charge this equipment × aircraft (any qty). */
        includedForAds: { type: Boolean, default: true },
        unitPriceINR: { type: Number },
        unitPriceUSD: { type: Number },
        uom: { type: String },
        aircraftType: { type: String },
        aircraftTypes: { type: [String], default: [] },
        effectiveMonth: { type: String },
        category: { type: String },
        remarks: { type: String },
      },
    ],
    default: [],
  })
  adsEquipmentRules?: Array<{
    serviceCode: string;
    freePerFlight?: number;
    freePerFlightNb?: number;
    freePerFlightWb?: number;
    alwaysChargeable?: boolean;
    includedForAds?: boolean;
    unitPriceINR?: number;
    unitPriceUSD?: number;
    uom?: string;
    aircraftType?: string;
    aircraftTypes?: string[];
    category?: string;
    remarks?: string;
    effectiveMonth?: string;
  }>;

  @Prop()
  flightsPerSchedule?: number;

  /** Uploaded signed contract PDF (stored as base64 for preview/download). */
  @Prop({ trim: true })
  contractPdfFileName?: string;

  @Prop({ trim: true })
  contractPdfContentType?: string;

  @Prop()
  contractPdfBase64?: string;

  @Prop()
  contractPdfUploadedAt?: Date;

  @Prop({ required: true, enum: ['draft', 'active', 'expired'], default: 'draft' })
  status: string;

  @Prop({ type: Types.ObjectId })
  currentVersionId?: Types.ObjectId;
}

export const BillingContractSchema = SchemaFactory.createForClass(BillingContract);
BillingContractSchema.index(
  { stationCode: 1, contractNumber: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.Contract } },
);
BillingContractSchema.index({ stationCode: 1, customerCode: 1, status: 1 });

export type BillingRateCardDocument = BillingRateCard & Document;

@Schema()
export class BillingRateCard {
  @Prop({ type: Types.ObjectId, required: true })
  contractId: Types.ObjectId;

  @Prop({ required: true, uppercase: true })
  customerCode: string;

  @Prop({ required: true })
  serviceCode: string;

  @Prop()
  category?: string;

  /** Aircraft type band for BHS service lists (Dom/Int stays in category). */
  @Prop({ trim: true, uppercase: true })
  aircraftType?: string;

  /** Price card column reference — TRND, PU, PH, etc. */
  @Prop({ trim: true, uppercase: true })
  billingReference?: string;

  @Prop()
  unitPriceINR?: number;

  @Prop()
  unitPriceUSD?: number;

  @Prop()
  ceilingRateINR?: number;

  @Prop()
  ceilingRateUSD?: number;

  @Prop({ required: true, enum: ['INR', 'USD'] })
  currency: string;

  @Prop({ required: true })
  uom: string;

  @Prop()
  minBillableUnits?: number;

  @Prop()
  discountPercent?: number;

  @Prop()
  discountDelayPercent?: number;

  @Prop()
  royaltyRate?: number;

  /** Price-card / contract clause notes (e.g. free WCHR allowance, CPI band). */
  @Prop({ trim: true })
  remarks?: string;

  /** Inclusive = covered in BHS package; exclusive = billed separately (visible under ADS). */
  @Prop({ enum: ['inclusive', 'exclusive'], default: 'inclusive' })
  billingScope?: string;

  /** Free units of this service per flight (ADS overage = used − free). */
  @Prop()
  serviceCount?: number;

  /**
   * When true, bill all used units on ADS even if the service is on the BHS package list.
   * Overrides inclusive free allowance / fully-package-included.
   */
  @Prop({ default: false })
  alwaysChargeable?: boolean;

  /**
   * When true, this equipment must never be ADS-charged (contract “not included for ADS”).
   * Blocks exclusive pricing and adhoc fallback for matching usage.
   */
  @Prop({ default: false })
  adsExcluded?: boolean;

  @Prop({ required: true })
  validFrom: Date;

  @Prop({ required: true })
  validTo: Date;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingRateCardSchema = SchemaFactory.createForClass(BillingRateCard);
BillingRateCardSchema.index({ stationCode: 1, customerCode: 1, serviceCode: 1, validFrom: 1 });
BillingRateCardSchema.index({ contractId: 1 });

export type BillingPriceCardAirlineDocument = BillingPriceCardAirline & Document;

@Schema()
export class BillingPriceCardAirline {
  @Prop({ required: true, enum: ['BHS', 'ADS', 'RAF'] })
  handlingType: string;

  @Prop({ required: true, uppercase: true, trim: true })
  customerCode: string;

  @Prop({ required: true, trim: true })
  airlineName: string;

  @Prop({ required: true })
  validFrom: Date;

  @Prop({ required: true })
  validTo: Date;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ required: true, trim: true })
  aircraftType: string;

  @Prop({ required: true, enum: ['Dom', 'Int', 'Ta'] })
  category: string;

  /** BHS handling — unit price from the airline price card. */
  @Prop()
  price?: number;

  /** INR or USD. Delhi price cards store the sheet currency with the amount. */
  @Prop({ trim: true })
  currencyCode?: string;

  /** Sheet says the rate continues until further notice. */
  @Prop({ default: false })
  openEnded?: boolean;

  /**
   * Which FHR handling this BHS package prices.
   * Missing values stay scheduled so existing cards keep billing turnaround flights.
   */
  @Prop({ enum: ['scheduled', 'additional'], default: 'scheduled' })
  flightOperation?: 'scheduled' | 'additional';

  /**
   * When on, a later flight of this airline and aircraft on the same station
   * calendar day uses incrementalPrice instead of price.
   */
  @Prop({ default: false })
  incrementalFlightsActive?: boolean;

  @Prop()
  incrementalPrice?: number;

  @Prop({ required: true, trim: true })
  stationCode: string;

  @Prop({ default: true })
  active: boolean;
}

export const BillingPriceCardAirlineSchema =
  SchemaFactory.createForClass(BillingPriceCardAirline);
BillingPriceCardAirlineSchema.index(
  { stationCode: 1, handlingType: 1, customerCode: 1, aircraftType: 1 },
  { partialFilterExpression: { docType: BillingDocType.PriceCardAirline, active: true } },
);
BillingPriceCardAirlineSchema.index({ stationCode: 1, handlingType: 1, customerCode: 1 });

export type BillingRafAdhocRateDocument = BillingRafAdhocRate & Document;

/** Pan-India or station RAF adhoc tariff — used when no RAF contract exists. */
@Schema()
export class BillingRafAdhocRate {
  @Prop({ required: true, enum: ['equipment', 'manpower', 'service'] })
  itemKind: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ required: true, trim: true })
  uom: string;

  @Prop()
  unitPriceINR?: number;

  @Prop()
  unitPriceUSD?: number;

  /** Percentage of another charge (e.g. excess baggage 10%). */
  @Prop()
  percentValue?: number;

  @Prop({ required: true })
  validFrom: Date;

  @Prop({ required: true })
  validTo: Date;

  /** `*` = all stations (seed default). Else IATA station code. */
  @Prop({ required: true, uppercase: true, trim: true })
  stationCode: string;

  @Prop({ trim: true })
  sourceWorkbook?: string;
}

export const BillingRafAdhocRateSchema = SchemaFactory.createForClass(BillingRafAdhocRate);
BillingRafAdhocRateSchema.index({
  stationCode: 1,
  itemKind: 1,
  label: 1,
  validFrom: 1,
});
BillingRafAdhocRateSchema.index({ stationCode: 1, validFrom: 1, validTo: 1 });

export type BillingTaxRuleDocument = BillingTaxRule & Document;

@Schema()
export class BillingTaxRule {
  @Prop({ required: true })
  ruleCode: string;

  @Prop({ required: true })
  gstPercent: number;

  @Prop({ required: true, enum: ['intra_state', 'inter_state'] })
  placeOfSupply: string;

  @Prop({ required: true })
  cgstPercent: number;

  @Prop({ required: true })
  sgstPercent: number;

  @Prop({ required: true })
  igstPercent: number;

  @Prop()
  serviceCodePattern?: string;

  @Prop()
  customerGstGroup?: string;

  @Prop({ required: true })
  effectiveFrom: Date;

  @Prop({ required: true })
  effectiveTo: Date;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingTaxRuleSchema = SchemaFactory.createForClass(BillingTaxRule);
BillingTaxRuleSchema.index(
  { stationCode: 1, ruleCode: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.TaxRule } },
);

export type BillingExchangeRateDocument = BillingExchangeRate & Document;

@Schema()
export class BillingExchangeRate {
  @Prop({ required: true })
  currencyCode: string;

  @Prop({ required: true })
  rateToINR: number;

  @Prop({ required: true })
  startingDate: Date;

  @Prop()
  relationalRate?: number;

  @Prop({ required: true, enum: ['manual', 'rbi', 'import'], default: 'manual' })
  source: string;

  @Prop({ required: true, trim: true, uppercase: true })
  stationCode: string;
}

export const BillingExchangeRateSchema =
  SchemaFactory.createForClass(BillingExchangeRate);
BillingExchangeRateSchema.index(
  { stationCode: 1, currencyCode: 1, startingDate: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.ExchangeRate } },
);

export type BillingSequenceDocument = BillingSequence & Document;

@Schema()
export class BillingSequence {
  @Prop({ required: true })
  sequenceCode: string;

  @Prop({ required: true })
  prefix: string;

  @Prop({ required: true, default: 0 })
  currentValue: number;

  @Prop({ required: true })
  fiscalYear: string;

  @Prop({ required: true, enum: ['invoice', 'credit_memo'] })
  documentType: string;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingSequenceSchema = SchemaFactory.createForClass(BillingSequence);
BillingSequenceSchema.index(
  { stationCode: 1, sequenceCode: 1, fiscalYear: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.Sequence } },
);

export type BillingSettingsDocument = BillingSettings & Document;

@Schema()
export class BillingSettings {
  @Prop({ required: true })
  stationCode: string;

  @Prop()
  defaultPaymentTerms?: string;

  @Prop()
  defaultGstGroup?: string;

  @Prop({ type: Object })
  dimensionMappings?: { dimension1: string; dimension2: string };

  @Prop({ default: true })
  approvalRequired: boolean;

  @Prop()
  monthCloseLockDay?: number;

  /** GST state code (e.g. 33) — printed in invoice State Code field. */
  @Prop()
  gstStateCode?: string;

  @Prop({ type: Object })
  companyLegalEntity?: {
    name: string;
    address?: string;
    gstin?: string;
    pan?: string;
    /** Corporate Identification Number (MCA), e.g. U62200DL2008PTC184155. */
    cin?: string;
    /** Our MSME / Udyam registration number for this station. */
    msme?: string;
    logoUrl?: string;
  };

  @Prop({ type: Object })
  bankDetails?: {
    bankName?: string;
    branchAddress?: string;
    beneficiaryName?: string;
    accountNumber?: string;
    ifscCode?: string;
    swiftCode?: string;
    chequePayableText?: string;
  };

  /** Phase 6 — per-station native billing cutover */
  @Prop({ default: false })
  nativeBillingEnabled?: boolean;

  @Prop({ default: 'parallel' })
  cutoverPhase?: string;

  @Prop()
  parallelRunStartDate?: Date;

  @Prop()
  bcReadOnlyDate?: Date;

  @Prop()
  frisPrimaryDate?: Date;

  /** Phase 8 — BC decommission */
  @Prop()
  decommissionedAt?: Date;

  @Prop()
  decommissionedBy?: string;

  /** Airport ownership, revenue share, and optional ceiling rates from the Profile setup flow. */
  @Prop({ type: Object })
  airportCommercial?: {
    ownership: 'private' | 'aai';
    revenueShareMechanism: 'gross' | 'net';
    revenueSharePercent: number;
    minRevenueShareApplicable: boolean;
    magCurrency?: 'INR' | 'USD' | 'EUR';
    effectiveFrom: Date;
    effectiveTo: Date;
    ceilingRates?: Array<{
      aircraftCode: string;
      serviceType: string;
      amount: number;
    }>;
  };

  /**
   * Royalty Master concessions (net and gross). Each side stores three flight concessions.
   * Exclusive invoices read the card selected for this station.
   */
  @Prop({ type: Object })
  royaltyMaster?: {
    net?: {
      effectiveFrom?: Date;
      effectiveTo?: Date;
      scheduledInternational?: { percent: number; effectiveFrom?: Date; effectiveTo?: Date };
      scheduledDomestic?: { percent: number; effectiveFrom?: Date; effectiveTo?: Date };
      generalAviation?: { percent: number; effectiveFrom?: Date; effectiveTo?: Date };
    };
    gross?: {
      effectiveFrom?: Date;
      effectiveTo?: Date;
      scheduledInternational?: { percent: number; effectiveFrom?: Date; effectiveTo?: Date };
      scheduledDomestic?: { percent: number; effectiveFrom?: Date; effectiveTo?: Date };
      generalAviation?: { percent: number; effectiveFrom?: Date; effectiveTo?: Date };
    };
  };

  /** When false, legacy PATCH navision-export should be blocked (integration guard). */
  @Prop({ default: true })
  legacyNavExportEnabled?: boolean;

  @Prop({ type: Object })
  cutoverNotes?: Record<string, unknown>;
}

export const BillingSettingsSchema = SchemaFactory.createForClass(BillingSettings);
BillingSettingsSchema.index(
  { stationCode: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.Settings } },
);

export type BillingPreparationRecordDocument = BillingPreparationRecord & Document;

@Schema()
export class BillingPreparationRecord {
  @Prop({ required: true })
  sourceType: string;

  @Prop({ type: Object, required: true })
  sourceRef: Record<string, unknown>;

  @Prop({ required: true })
  customerCode: string;

  @Prop()
  customerName?: string;

  @Prop({ required: true })
  billingPeriodStart: Date;

  @Prop({ required: true })
  billingPeriodEnd: Date;

  @Prop({ required: true, default: 'eligible' })
  status: string;

  @Prop({ type: Object })
  contractMatch?: Record<string, unknown>;

  @Prop({ type: Object })
  rateMatch?: Record<string, unknown>;

  @Prop({ type: [Object], default: [] })
  validationResults: Array<{ rule: string; passed: boolean; message?: string }>;

  @Prop({ type: Object, default: {} })
  manualOverrides?: Record<string, boolean>;

  @Prop({ type: [Object], default: [] })
  customChecks?: Array<{
    id: string;
    label: string;
    message?: string;
    passed: boolean;
  }>;

  @Prop({ type: Object })
  cancellationBilling?: {
    enabled?: boolean;
    bhsChargeablePercent?: number;
  };

  @Prop({ type: [Object], default: [] })
  workflowNotes?: Array<{
    id: string;
    at: Date;
    userId: string;
    userName: string;
    audience: string;
    directedToUserId?: string;
    directedToUserName?: string;
    body: string;
    context?: string;
  }>;

  @Prop({ type: Object })
  operationalSnapshot?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId })
  invoiceDraftId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  invoiceId?: Types.ObjectId;

  @Prop({ required: true })
  stationCode: string;

  /**
   * User who fetched/sent this row into preparation.
   * Missing on rows created before per-user workflow isolation (still station-visible).
   */
  @Prop()
  ownerUserId?: string;
}

export const BillingPreparationRecordSchema = SchemaFactory.createForClass(
  BillingPreparationRecord,
);
BillingPreparationRecordSchema.index({ stationCode: 1, status: 1, billingPeriodStart: 1 });
BillingPreparationRecordSchema.index({
  stationCode: 1,
  ownerUserId: 1,
  status: 1,
  billingPeriodStart: 1,
});
BillingPreparationRecordSchema.index({
  stationCode: 1,
  'sourceRef.serialNo': 1,
  billingPeriodStart: 1,
});
// Send/unsend dedupe: status $nin is weak — lead with period + sourceType + identity.
BillingPreparationRecordSchema.index({
  stationCode: 1,
  billingPeriodStart: 1,
  sourceType: 1,
  'sourceRef.usageRowId': 1,
});
BillingPreparationRecordSchema.index({
  stationCode: 1,
  billingPeriodStart: 1,
  sourceType: 1,
  'sourceRef.serialNo': 1,
});

export type BillingInvoiceHeaderDocument = BillingInvoiceHeader & Document;

@Schema()
export class BillingInvoiceHeader {
  @Prop({ sparse: true })
  invoiceNumber?: string;

  @Prop({ required: true })
  draftNumber: string;

  @Prop({ required: true })
  customerCode: string;

  @Prop({ required: true })
  customerName: string;

  @Prop({ trim: true })
  customerAddress?: string;

  @Prop()
  billToCustomerCode?: string;

  @Prop({ required: true, default: 'draft' })
  status: string;

  @Prop()
  postingDate?: Date;

  @Prop({ required: true })
  documentDate: Date;

  @Prop()
  dueDate?: Date;

  @Prop({ required: true, enum: ['INR', 'USD'] })
  currencyCode: string;

  @Prop({ required: true, default: 1 })
  currencyFactor: number;

  /**
   * USD invoices: CGST/SGST and final receivable stay in USD (no INR conversion).
   * Set via invoice detail "Total amount receivable as USD".
   */
  @Prop({ default: false })
  totalReceivableInUsd?: boolean;

  @Prop({ default: 0 })
  subtotalExclTax: number;

  /** Set from the invoice edit screen. Null means the contract percent is used. */
  @Prop({ type: Number, default: null })
  concessionPercentOverride?: number | null;

  @Prop({ default: 0 })
  concessionFeePercent?: number;

  @Prop({ default: 0 })
  concessionFeeAmount?: number;

  @Prop({ default: 0 })
  taxTotal: number;

  @Prop({ default: 0 })
  totalInclTax: number;

  @Prop()
  remainingAmount?: number;

  @Prop({ required: true })
  billingPeriodStart: Date;

  @Prop({ required: true })
  billingPeriodEnd: Date;

  @Prop({ type: Types.ObjectId })
  contractId?: Types.ObjectId;

  @Prop()
  approvalStatus?: string;

  @Prop({ type: Types.ObjectId })
  backingSheetId?: Types.ObjectId;

  @Prop()
  postedAt?: Date;

  @Prop()
  postedBy?: string;

  @Prop({ default: false })
  cancelled: boolean;

  @Prop({ type: Types.ObjectId })
  correctedFromInvoiceId?: Types.ObjectId;

  @Prop({ type: Object })
  pdfSnapshot?: Record<string, unknown>;

  /** Manual bill-to / PDF overrides applied on draft before generate. */
  @Prop({ type: Object })
  customBillOverrides?: {
    billToGstin?: string;
    billToPan?: string;
    billToStateCode?: string;
    placeOfSupply?: string;
    serviceStation?: string;
    serviceTableTitle?: string;
    updatedAt?: string;
    updatedBy?: string;
  };

  @Prop()
  airlineEmailSentAt?: Date;

  @Prop({ type: [String], default: [] })
  airlineEmailSentTo?: string[];

  @Prop({ type: [Types.ObjectId], default: [] })
  preparationRecordIds?: Types.ObjectId[];

  /** Invoice family for draft grouping / UI: BHS | ADS | RAF | OTHER */
  @Prop({ trim: true, uppercase: true })
  invoiceCategory?: string;

  /** Shared by ADS drafts created by splitting one combined draft. */
  @Prop({ trim: true })
  adsSplitFamilyId?: string;

  /** Unique group inside an ADS split family; prevents approval consolidation. */
  @Prop({ trim: true })
  adsSplitGroupKey?: string;

  @Prop({ default: false })
  inBin?: boolean;

  @Prop()
  binnedAt?: Date;

  @Prop()
  binnedBy?: string;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingInvoiceHeaderSchema =
  SchemaFactory.createForClass(BillingInvoiceHeader);
BillingInvoiceHeaderSchema.index(
  { stationCode: 1, invoiceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      docType: BillingDocType.InvoiceHeader,
      invoiceNumber: { $exists: true, $type: 'string' },
    },
  },
);
BillingInvoiceHeaderSchema.index(
  { stationCode: 1, draftNumber: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.InvoiceHeader } },
);
BillingInvoiceHeaderSchema.index({ stationCode: 1, status: 1, billingPeriodStart: 1 });
BillingInvoiceHeaderSchema.index({ stationCode: 1, inBin: 1, updatedAt: -1 });
BillingInvoiceHeaderSchema.index({ stationCode: 1, invoiceCategory: 1, status: 1 });

export type BillingAuditLogDocument = BillingAuditLog & Document;

@Schema()
export class BillingAuditLog {
  @Prop({ required: true })
  entityType: string;

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true, default: () => new Date() })
  timestamp: Date;

  @Prop({ type: Object })
  changes?: Record<string, unknown>;

  @Prop()
  ipAddress?: string;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingAuditLogSchema = SchemaFactory.createForClass(BillingAuditLog);
BillingAuditLogSchema.index({ stationCode: 1, entityType: 1, entityId: 1, timestamp: -1 });
BillingAuditLogSchema.index({ stationCode: 1, timestamp: -1 });

export type BillingInvoiceLineDocument = BillingInvoiceLine & Document;

@Schema()
export class BillingInvoiceLine {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  invoiceId: Types.ObjectId;

  @Prop({ required: true })
  lineNo: number;

  @Prop({ required: true, default: 'service' })
  lineType: string;

  @Prop({ required: true })
  serviceCode: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, default: 1 })
  quantity: number;

  @Prop({ required: true, default: 'Per Flight' })
  uom: string;

  @Prop({ required: true, default: 0 })
  unitPrice: number;

  @Prop({ default: 0 })
  lineDiscountPercent?: number;

  @Prop({ required: true, default: 0 })
  lineAmountExclTax: number;

  @Prop({ default: 0 })
  gstPercent: number;

  @Prop({ default: 0 })
  cgstAmount: number;

  @Prop({ default: 0 })
  sgstAmount: number;

  @Prop({ default: 0 })
  igstAmount: number;

  @Prop({ required: true, default: 0 })
  lineAmountInclTax: number;

  @Prop({ type: Object })
  sourceRef?: Record<string, unknown>;

  @Prop()
  sourceType?: string;

  /**
   * Preparation records that produced this line. Split/merge ownership uses
   * this set so one equipment usage cannot live on two open invoices.
   */
  @Prop({ type: [Types.ObjectId], default: [] })
  preparationRecordIds?: Types.ObjectId[];

  @Prop({ required: true })
  stationCode: string;
}

export const BillingInvoiceLineSchema =
  SchemaFactory.createForClass(BillingInvoiceLine);
BillingInvoiceLineSchema.index(
  { invoiceId: 1, lineNo: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.InvoiceLine } },
);
BillingInvoiceLineSchema.index({ invoiceId: 1, preparationRecordIds: 1 });

export type BillingBackingSheetDocument = BillingBackingSheet & Document;

@Schema()
export class BillingBackingSheet {
  @Prop({ type: Types.ObjectId, required: true })
  invoiceId: Types.ObjectId;

  @Prop({ required: true })
  customerCode: string;

  @Prop({ required: true })
  billingPeriodStart: Date;

  @Prop({ required: true })
  billingPeriodEnd: Date;

  @Prop({ type: [Object], default: [] })
  rows: Array<Record<string, unknown>>;

  @Prop({ default: 0 })
  rowCount: number;

  @Prop()
  generatedAt?: Date;

  @Prop({ type: Object })
  pdfSnapshot?: Record<string, unknown>;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingBackingSheetSchema =
  SchemaFactory.createForClass(BillingBackingSheet);
BillingBackingSheetSchema.index(
  { invoiceId: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.BackingSheet } },
);

export type BillingCreditMemoDocument = BillingCreditMemo & Document;

@Schema()
export class BillingCreditMemo {
  @Prop({ sparse: true })
  creditMemoNumber?: string;

  @Prop({ required: true })
  customerCode: string;

  @Prop({ type: Types.ObjectId })
  appliesToInvoiceId?: Types.ObjectId;

  @Prop()
  appliesToInvoiceNo?: string;

  @Prop({ required: true, default: 'draft' })
  status: string;

  @Prop()
  postingDate?: Date;

  @Prop({ required: true })
  documentDate: Date;

  @Prop({ required: true, enum: ['INR', 'USD'] })
  currencyCode: string;

  @Prop({ required: true, default: 1 })
  currencyFactor: number;

  @Prop({ type: [Object], default: [] })
  lines: Array<Record<string, unknown>>;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: Object })
  xxldDecision?: Record<string, unknown>;

  @Prop({ default: 0 })
  totalInclTax: number;

  @Prop({ type: Object })
  pdfSnapshot?: Record<string, unknown>;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingCreditMemoSchema =
  SchemaFactory.createForClass(BillingCreditMemo);
BillingCreditMemoSchema.index(
  { stationCode: 1, creditMemoNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      docType: BillingDocType.CreditMemo,
      creditMemoNumber: { $exists: true, $type: 'string' },
    },
  },
);

export type BillingReportDocument = BillingReport & Document;

@Schema()
export class BillingReport {
  @Prop({ required: true })
  reportType: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: Object, required: true })
  parameters: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  data: Record<string, unknown>;

  @Prop()
  generatedBy?: string;

  @Prop({ required: true, default: () => new Date() })
  generatedAt: Date;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingReportSchema = SchemaFactory.createForClass(BillingReport);
BillingReportSchema.index({ stationCode: 1, reportType: 1, generatedAt: -1 });

export type BillingExportDocument = BillingExport & Document;

@Schema()
export class BillingExport {
  @Prop({ required: true })
  exportType: string;

  @Prop({ type: Types.ObjectId, required: true })
  documentId: Types.ObjectId;

  @Prop({ required: true })
  fileName: string;

  @Prop()
  storageKey?: string;

  @Prop({ required: true })
  exportedBy: string;

  @Prop({ required: true, default: () => new Date() })
  exportedAt: Date;

  @Prop({ trim: true })
  recipient?: string;

  @Prop({ required: true })
  stationCode: string;
}

export const BillingExportSchema = SchemaFactory.createForClass(BillingExport);

export type BillingBcBaselineDocument = BillingBcBaseline & Document;

/** Optional BC posted totals imported for parallel-run reconciliation (Phase 6). */
@Schema()
export class BillingBcBaseline {
  @Prop({ required: true })
  stationCode: string;

  @Prop({ required: true })
  billingPeriodStart: Date;

  @Prop({ required: true })
  billingPeriodEnd: Date;

  @Prop()
  customerCode?: string;

  @Prop()
  invoiceNumber?: string;

  @Prop({ required: true, default: 0 })
  totalInclTax: number;

  @Prop({ default: 'csv_import' })
  source: string;

  @Prop()
  importedBy?: string;

  @Prop({ required: true, default: () => new Date() })
  importedAt: Date;
}

export const BillingBcBaselineSchema = SchemaFactory.createForClass(BillingBcBaseline);
BillingBcBaselineSchema.index({
  stationCode: 1,
  billingPeriodStart: 1,
  billingPeriodEnd: 1,
});

export type BillingParallelRunSnapshotDocument = BillingParallelRunSnapshot & Document;

/** Weekly parallel-run reconciliation capture (Phase 7). */
@Schema()
export class BillingParallelRunSnapshot {
  @Prop({ required: true })
  stationCode: string;

  @Prop({ required: true })
  billingPeriodStart: Date;

  @Prop({ required: true })
  billingPeriodEnd: Date;

  @Prop()
  weekNumber?: number;

  @Prop()
  weekLabel?: string;

  @Prop({ type: Object, required: true })
  metrics: Record<string, unknown>;

  @Prop({ required: true, default: false })
  readyForSignoff: boolean;

  @Prop({ required: true })
  capturedBy: string;

  @Prop({ required: true, default: () => new Date() })
  capturedAt: Date;

  @Prop()
  signedOffBy?: string;

  @Prop()
  signedOffAt?: Date;

  @Prop()
  signOffNotes?: string;
}

export const BillingParallelRunSnapshotSchema =
  SchemaFactory.createForClass(BillingParallelRunSnapshot);
BillingParallelRunSnapshotSchema.index({
  stationCode: 1,
  billingPeriodStart: 1,
  billingPeriodEnd: 1,
  capturedAt: -1,
});

export type BillingBcDecommissionRecordDocument = BillingBcDecommissionRecord & Document;

/** Formal BC decommission sign-off record (Phase 8). */
@Schema()
export class BillingBcDecommissionRecord {
  @Prop({ required: true })
  stationCode: string;

  @Prop({ required: true })
  decommissionedBy: string;

  @Prop({ required: true, default: () => new Date() })
  decommissionedAt: Date;

  @Prop({ type: Object, required: true })
  readinessSnapshot: Record<string, unknown>;

  @Prop()
  notes?: string;

  @Prop({ default: false })
  forced?: boolean;

  @Prop({ default: false })
  rolledBack?: boolean;

  @Prop()
  rolledBackAt?: Date;

  @Prop()
  rolledBackBy?: string;
}

export const BillingBcDecommissionRecordSchema =
  SchemaFactory.createForClass(BillingBcDecommissionRecord);
BillingBcDecommissionRecordSchema.index({ stationCode: 1, decommissionedAt: -1 });


export type BillingKycCaseDocument = BillingKycCase & Document;

@Schema()
export class BillingKycCase {
  @Prop({ required: true, trim: true })
  stationCode: string;

  @Prop({ required: true, uppercase: true, trim: true })
  customerCode: string;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({
    required: true,
    enum: [
      'draft',
      'invited',
      'in_progress',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'expired',
    ],
    default: 'draft',
  })
  status: string;

  @Prop({ type: Object, default: {} })
  form: Record<string, unknown>;

  @Prop({ default: 0 })
  completenessPercent: number;

  @Prop({ trim: true, lowercase: true })
  inviteEmail?: string;

  @Prop({ trim: true, select: false })
  inviteTokenHash?: string;

  @Prop()
  inviteExpiresAt?: Date;

  @Prop()
  inviteSentAt?: Date;

  @Prop({ trim: true })
  inviteSentBy?: string;

  @Prop()
  submittedAt?: Date;

  @Prop()
  reviewedAt?: Date;

  @Prop({ trim: true })
  reviewedBy?: string;

  @Prop({ trim: true })
  reviewNote?: string;

  @Prop({
    type: [
      {
        at: { type: Date, required: true },
        byUserId: { type: String, trim: true },
        byUserName: { type: String, trim: true },
        reason: { type: String, trim: true, required: true },
        context: { type: String, trim: true },
      },
    ],
    default: [],
  })
  overrideHistory?: Array<{
    at: Date;
    byUserId?: string;
    byUserName?: string;
    reason: string;
    context?: string;
  }>;

  @Prop({
    type: [
      {
        docType: { type: String, trim: true, required: true },
        fileKey: { type: String, trim: true, required: true },
        originalName: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        uploadedBy: { type: String, trim: true },
        uploadedAt: { type: Date },
      },
    ],
    default: [],
  })
  documents: Array<{
    docType: string;
    fileKey: string;
    originalName?: string;
    mimeType?: string;
    uploadedBy?: string;
    uploadedAt?: Date;
  }>;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop({ trim: true })
  updatedBy?: string;
}

export const BillingKycCaseSchema = SchemaFactory.createForClass(BillingKycCase);
BillingKycCaseSchema.index({ stationCode: 1, customerCode: 1, status: 1 });
BillingKycCaseSchema.index({ stationCode: 1, updatedAt: -1 });
BillingKycCaseSchema.index(
  { inviteTokenHash: 1 },
  { unique: true, partialFilterExpression: { inviteTokenHash: { $type: 'string' } } },
);
