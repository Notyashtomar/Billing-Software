'use client';

import { useMemo } from 'react';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import {
  buildEquipmentComboOptions,
  buildUnitComboOptions,
  CUSTOM_BILLING_TABLE_COMBO_CLASS,
  type CustomBillingEquipmentOption,
} from './customBillingLineOptions';

type EquipmentCellProps = {
  index: number;
  particular: string;
  equipmentOptions: CustomBillingEquipmentOption[];
  equipmentByCode: Map<string, CustomBillingEquipmentOption>;
  loadingLookups: boolean;
  disabled: boolean;
  onParticularChange: (index: number, particular: string, unitHint?: string) => void;
};

export function CustomBillingEquipmentCell({
  index,
  particular,
  equipmentOptions,
  equipmentByCode,
  loadingLookups,
  disabled,
  onParticularChange,
}: EquipmentCellProps) {
  const options = useMemo(
    () => buildEquipmentComboOptions(equipmentOptions, [particular]),
    [equipmentOptions, particular],
  );

  return (
    <SearchableCombobox
      fieldLabel={`Particulars line ${index + 1}`}
      hideLabel
      value={particular}
      onChange={(value) => onParticularChange(index, value)}
      onPickOption={(option) => {
        const selected = equipmentByCode.get(option.label.trim().toLowerCase());
        onParticularChange(index, option.label, selected?.uom?.trim());
        return true;
      }}
      options={options}
      loading={loadingLookups}
      placeholder={loadingLookups ? 'Loading equipment…' : 'Select or type equipment'}
      disabled={disabled || loadingLookups}
      hideOptionDescription
      maxVisibleOptions={250}
      inputClassName={`${CUSTOM_BILLING_TABLE_COMBO_CLASS} min-w-[14rem]`}
    />
  );
}

type UnitCellProps = {
  index: number;
  unit: string;
  unitOptions: string[];
  loadingLookups: boolean;
  disabled: boolean;
  onUnitChange: (index: number, unit: string) => void;
};

export function CustomBillingUnitCell({
  index,
  unit,
  unitOptions,
  loadingLookups,
  disabled,
  onUnitChange,
}: UnitCellProps) {
  const options = useMemo(
    () => buildUnitComboOptions(unitOptions, [unit]),
    [unitOptions, unit],
  );

  return (
    <SearchableCombobox
      fieldLabel={`Unit line ${index + 1}`}
      hideLabel
      value={unit}
      onChange={(value) => onUnitChange(index, value)}
      onPickOption={(option) => {
        onUnitChange(index, option.label);
        return true;
      }}
      options={options}
      loading={loadingLookups}
      placeholder={loadingLookups ? 'Loading units…' : 'Select or type unit'}
      disabled={disabled || loadingLookups}
      hideOptionDescription
      maxVisibleOptions={120}
      inputClassName={`${CUSTOM_BILLING_TABLE_COMBO_CLASS} min-w-[9rem]`}
    />
  );
}
