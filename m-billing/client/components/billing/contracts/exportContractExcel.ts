// @ts-nocheck
import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import type {
  BillingContract,
  BillingContractAdsEquipmentRule,
  BillingContractClause,
} from '@/lib/billing-shared/types';
import {
  ADS_RULE_SHEET_HEADERS,
  CLAUSE_SHEET_HEADERS,
  CONTRACT_SHEET_HEADERS,
} from './importContractExcel';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';

function toBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const plain = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plain], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function formatDate(value: string | undefined): string {
  if (!value) return '';
  return formatBillingDate(value, '');
}

function formatYesNo(value: boolean | undefined): string {
  return value ? 'yes' : 'no';
}

function formatList(values: string[] | undefined): string {
  return (values ?? []).filter(Boolean).join(', ');
}

function ruleAircraftTypes(rule: BillingContractAdsEquipmentRule): string {
  if (Array.isArray(rule.aircraftTypes) && rule.aircraftTypes.length > 0) {
    return formatList(rule.aircraftTypes);
  }
  return rule.aircraftType?.trim() ?? '';
}

function contractToRow(contract: BillingContract): (string | number)[] {
  const charges = contract.conditionalCharges ?? {};
  return [
    contract.contractNumber,
    contract.customerCode,
    contract.category,
    formatList(contract.aircraftTypes),
    formatDate(contract.priceValidFrom),
    formatDate(contract.priceValidTo),
    contract.cancellationWithinHours ?? '',
    charges.divertedDom ?? '',
    charges.divertedInt ?? '',
    charges.returnToRamp ?? '',
    charges.cancellationWithinHoursPercent ?? '',
    charges.technicalHandlingChargesPercent ?? '',
    charges.standbyChargesPercent ?? '',
    charges.filoLifoChargesPercent ?? '',
    contract.status,
    formatYesNo(contract.adsBillingEnabled),
  ];
}

function adsRuleToRow(
  contractNumber: string,
  rule: BillingContractAdsEquipmentRule,
): (string | number)[] {
  return [
    contractNumber,
    rule.serviceCode,
    formatYesNo(rule.includedForAds !== false),
    rule.freePerFlight ?? 0,
    rule.freePerFlightNb ?? '',
    rule.freePerFlightWb ?? '',
    formatYesNo(rule.alwaysChargeable),
    rule.uom ?? 'EA',
    rule.unitPriceINR ?? '',
    rule.unitPriceUSD ?? '',
    ruleAircraftTypes(rule),
    rule.effectiveMonth ?? '',
    rule.category ?? '',
    rule.remarks ?? '',
  ];
}

function clauseToRow(
  contractNumber: string,
  clause: BillingContractClause,
): string[] {
  return [
    contractNumber,
    clause.clauseType,
    clause.label ?? '',
    clause.body,
    formatList(clause.appliesTo),
  ];
}

export async function exportContractsToExcel(contracts: BillingContract[]): Promise<void> {
  if (contracts.length === 0) {
    throw new Error('Select at least one contract to export.');
  }

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();

  const contractsSheet = workbook.addWorksheet('Contracts');
  contractsSheet.addRow([...CONTRACT_SHEET_HEADERS]);
  contractsSheet.getRow(1).font = { bold: true };
  contractsSheet.columns = [
    { width: 22 },
    { width: 14 },
    { width: 10 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
  ];

  const adsSheet = workbook.addWorksheet('ADS Rules');
  adsSheet.addRow([...ADS_RULE_SHEET_HEADERS]);
  adsSheet.getRow(1).font = { bold: true };
  adsSheet.columns = [
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 8 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 14 },
    { width: 10 },
    { width: 28 },
  ];

  const clausesSheet = workbook.addWorksheet('Clauses');
  clausesSheet.addRow([...CLAUSE_SHEET_HEADERS]);
  clausesSheet.getRow(1).font = { bold: true };
  clausesSheet.columns = [
    { width: 22 },
    { width: 18 },
    { width: 20 },
    { width: 48 },
    { width: 20 },
  ];

  for (const contract of contracts) {
    contractsSheet.addRow(contractToRow(contract));

    for (const rule of contract.adsEquipmentRules ?? []) {
      if (!rule.serviceCode?.trim()) continue;
      adsSheet.addRow(adsRuleToRow(contract.contractNumber, rule));
    }

    for (const clause of contract.clauses ?? []) {
      if (!clause.body?.trim()) continue;
      clausesSheet.addRow(clauseToRow(contract.contractNumber, clause));
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    toBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    `billing-contracts-export-${stamp}.xlsx`,
  );
}
