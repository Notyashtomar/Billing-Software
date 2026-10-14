// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup, TextArea, TextInput } from '../settings/SettingsFormFields';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingCustomer } from '@/lib/billing-shared/types';

const emptyForm = {
  customerCode: '',
  name: '',
  airlineInvoiceName: '',
  address: '',
  secondaryAddressEnabled: false,
  secondaryAddress: '',
  currencyCode: 'INR' as 'INR' | 'USD',
  paymentTermsCode: '',
  invoiceTerms: '',
  gstRegistrationNo: '',
  msmeRegistrationNo: '',
  billToCustomerCode: '',
  blocked: false,
  active: true,
  showPanOnInvoice: false,
  panNumber: '',
  showVatOnInvoice: false,
  vatNumber: '',
};

type Props = {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  record?: BillingCustomer | null;
};

export function CustomerFormDialog({ api, open, onOpenChange, onSaved, record }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = Boolean(record);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (record) {
      setForm({
        customerCode: record.customerCode,
        name: record.name,
        airlineInvoiceName: record.airlineInvoiceName ?? '',
        address: record.address ?? '',
        secondaryAddressEnabled: record.secondaryAddressEnabled === true,
        secondaryAddress: record.secondaryAddress ?? '',
        currencyCode: record.currencyCode,
        paymentTermsCode: record.paymentTermsCode ?? '',
        invoiceTerms: record.invoiceTerms ?? '',
        gstRegistrationNo: record.gstRegistrationNo ?? '',
        msmeRegistrationNo: record.msmeRegistrationNo ?? '',
        billToCustomerCode: record.billToCustomerCode ?? '',
        blocked: record.blocked ?? false,
        active: record.active ?? true,
        showPanOnInvoice: record.showPanOnInvoice === true,
        panNumber: record.panNumber ?? '',
        showVatOnInvoice: record.showVatOnInvoice === true,
        vatNumber: record.vatNumber ?? '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, record]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!form.name.trim()) {
        setError('Customer name is required.');
        return;
      }
      if (form.secondaryAddressEnabled && !form.secondaryAddress.trim()) {
        setError('Enter the second bill-to address, or turn the second address off.');
        return;
      }

      if (isEdit && record) {
        const code = form.customerCode.trim().toUpperCase();
        if (!code || code.length > 10) {
          setError('Customer code is required (max 10 characters).');
          return;
        }
        await api.updateCustomer(record._id, {
          customerCode: code,
          name: form.name.trim(),
          airlineInvoiceName: form.airlineInvoiceName.trim() || undefined,
          address: form.address.trim() || undefined,
          secondaryAddressEnabled: form.secondaryAddressEnabled,
          secondaryAddress: form.secondaryAddressEnabled
            ? form.secondaryAddress.trim() || undefined
            : undefined,
          currencyCode: form.currencyCode,
          paymentTermsCode: form.paymentTermsCode.trim() || undefined,
          invoiceTerms: form.invoiceTerms.trim(),
          gstRegistrationNo: form.gstRegistrationNo.trim() || undefined,
          msmeRegistrationNo: form.msmeRegistrationNo.trim() || undefined,
          billToCustomerCode: form.billToCustomerCode.trim().toUpperCase() || undefined,
          blocked: form.blocked,
          active: form.active,
          showPanOnInvoice: form.showPanOnInvoice,
          panNumber: form.panNumber.trim().toUpperCase() || undefined,
          showVatOnInvoice: form.showVatOnInvoice,
          vatNumber: form.vatNumber.trim().toUpperCase() || undefined,
        });
      } else {
        const code = form.customerCode.trim().toUpperCase();
        if (!code || code.length > 10) {
          setError('Customer code is required (max 10 characters).');
          return;
        }
        await api.createCustomer({
          customerCode: code,
          name: form.name.trim(),
          airlineInvoiceName: form.airlineInvoiceName.trim() || undefined,
          address: form.address.trim() || undefined,
          secondaryAddressEnabled: form.secondaryAddressEnabled,
          secondaryAddress: form.secondaryAddressEnabled
            ? form.secondaryAddress.trim() || undefined
            : undefined,
          currencyCode: form.currencyCode,
          paymentTermsCode: form.paymentTermsCode.trim() || undefined,
          invoiceTerms: form.invoiceTerms.trim(),
          gstRegistrationNo: form.gstRegistrationNo.trim() || undefined,
          msmeRegistrationNo: form.msmeRegistrationNo.trim() || undefined,
          billToCustomerCode: form.billToCustomerCode.trim().toUpperCase() || undefined,
          blocked: form.blocked,
          active: form.active,
          showPanOnInvoice: form.showPanOnInvoice,
          panNumber: form.panNumber.trim().toUpperCase() || undefined,
          showVatOnInvoice: form.showVatOnInvoice,
          vatNumber: form.vatNumber.trim().toUpperCase() || undefined,
        });
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-[color:var(--billing-border)] px-6 py-4 pr-12 text-left">
          <DialogTitle>{isEdit ? 'Edit customer' : 'New customer'}</DialogTitle>
          <DialogDescription>
            Airline billing master for your logged-in station.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => void submit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {error}
              </div>
            ) : null}

            <FieldGroup
              label="Customer code"
              htmlFor="customerCode"
              hint={
                isEdit
                  ? 'Changing the code also updates linked contracts and rate cards.'
                  : undefined
              }
            >
              <TextInput
                id="customerCode"
                value={form.customerCode}
                onChange={(v) => setForm((f) => ({ ...f, customerCode: v.toUpperCase() }))}
                placeholder="GF"
                required
                autoComplete="off"
              />
            </FieldGroup>

            <FieldGroup label="Airline / customer name" htmlFor="customerName">
              <TextInput
                id="customerName"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                required
                autoComplete="organization"
              />
            </FieldGroup>
            <FieldGroup
              label="Airline invoice name"
              htmlFor="airlineInvoiceName"
              hint="Printed under Bill to on the invoice. Leave blank to use the customer name."
            >
              <TextInput
                id="airlineInvoiceName"
                value={form.airlineInvoiceName}
                onChange={(v) => setForm((f) => ({ ...f, airlineInvoiceName: v }))}
                maxLength={200}
              />
            </FieldGroup>

            <FieldGroup
              label="Bill-to address"
              htmlFor="customerAddress"
              hint="Printed on tax invoices and invoice drafts. Use separate lines for street, city, and postal code."
            >
              <TextArea
                id="customerAddress"
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                rows={4}
                placeholder={'Airline billing office\nStreet address\nCity, state — PIN\nCountry'}
              />
            </FieldGroup>

            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
              <input
                id="secondaryAddressEnabled"
                type="checkbox"
                role="switch"
                aria-checked={form.secondaryAddressEnabled}
                className="mt-0.5 h-4 w-4"
                checked={form.secondaryAddressEnabled}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    secondaryAddressEnabled: e.target.checked,
                    secondaryAddress: e.target.checked ? f.secondaryAddress : '',
                  }))
                }
              />
              <span>
                Add a second bill-to address
                <span className="mt-0.5 block text-xs font-normal text-gray-500">
                  Off: one address on the invoice. On: a second address prints under the first, with the same line breaks.
                </span>
              </span>
            </label>
            {form.secondaryAddressEnabled ? (
              <FieldGroup
                label="Second bill-to address"
                htmlFor="customerSecondaryAddress"
                hint="Printed under the first address on the invoice. Use the same line breaks you want on the bill."
              >
                <TextArea
                  id="customerSecondaryAddress"
                  value={form.secondaryAddress}
                  onChange={(v) => setForm((f) => ({ ...f, secondaryAddress: v }))}
                  rows={4}
                  placeholder={'Registered office\nStreet address\nCity, state — PIN\nCountry'}
                />
              </FieldGroup>
            ) : null}

            <FieldGroup label="Billing currency" htmlFor="currencyCode">
              <select
                id="currencyCode"
                value={form.currencyCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currencyCode: e.target.value as 'INR' | 'USD' }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
            </FieldGroup>

            <FieldGroup label="Payment terms" htmlFor="paymentTermsCode">
              <TextInput
                id="paymentTermsCode"
                value={form.paymentTermsCode}
                onChange={(v) => setForm((f) => ({ ...f, paymentTermsCode: v }))}
              />
            </FieldGroup>

            <FieldGroup
              label="Terms and conditions"
              htmlFor="invoiceTerms"
              hint="Saved on this customer for the station you are signed into. Another station keeps its own terms."
            >
              <TextArea
                id="invoiceTerms"
                rows={8}
                value={form.invoiceTerms}
                onChange={(v) => setForm((f) => ({ ...f, invoiceTerms: v }))}
                placeholder={'1) Rates are excluding concession fee...\n2) Interest if payment is delayed...'}
              />
            </FieldGroup>

            <FieldGroup label="GST registration no." htmlFor="gstRegistrationNo">
              <TextInput
                id="gstRegistrationNo"
                value={form.gstRegistrationNo}
                onChange={(v) => setForm((f) => ({ ...f, gstRegistrationNo: v }))}
              />
            </FieldGroup>

            <FieldGroup label="MSME registration no." htmlFor="msmeRegistrationNo">
              <TextInput
                id="msmeRegistrationNo"
                value={form.msmeRegistrationNo}
                onChange={(v) => setForm((f) => ({ ...f, msmeRegistrationNo: v }))}
                placeholder="Udyam / MSME registration number"
              />
            </FieldGroup>

            <FieldGroup label="Bill-to customer code" htmlFor="billToCustomerCode">
              <TextInput
                id="billToCustomerCode"
                value={form.billToCustomerCode}
                onChange={(v) =>
                  setForm((f) => ({ ...f, billToCustomerCode: v.toUpperCase() }))
                }
              />
            </FieldGroup>

            <fieldset className="space-y-3 rounded-lg border border-gray-200 p-3">
              <legend className="px-1 text-sm font-medium text-gray-800">Invoice tax numbers</legend>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
                <input
                  id="showPanOnInvoice"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={form.showPanOnInvoice}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, showPanOnInvoice: e.target.checked }))
                  }
                />
                <span>
                  Show PAN on invoices
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    When checked, enter the PAN. It prints on BHS, ADS, and RAF invoices.
                  </span>
                </span>
              </label>
              {form.showPanOnInvoice ? (
                <FieldGroup label="PAN number" htmlFor="panNumber">
                  <TextInput
                    id="panNumber"
                    value={form.panNumber}
                    onChange={(v) => setForm((f) => ({ ...f, panNumber: v.toUpperCase() }))}
                    placeholder="AAACI1681G"
                    autoComplete="off"
                  />
                </FieldGroup>
              ) : null}
              <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
                <input
                  id="showVatOnInvoice"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={form.showVatOnInvoice}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, showVatOnInvoice: e.target.checked }))
                  }
                />
                <span>
                  Show VAT on invoices
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    When checked, enter the VAT number. It prints beside PAN on the invoice.
                  </span>
                </span>
              </label>
              {form.showVatOnInvoice ? (
                <FieldGroup label="VAT number" htmlFor="vatNumber">
                  <TextInput
                    id="vatNumber"
                    value={form.vatNumber}
                    onChange={(v) => setForm((f) => ({ ...f, vatNumber: v.toUpperCase() }))}
                    placeholder="VAT registration number"
                    autoComplete="off"
                  />
                </FieldGroup>
              ) : null}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Blocked" htmlFor="blocked">
                <select
                  id="blocked"
                  value={form.blocked ? 'yes' : 'no'}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, blocked: e.target.value === 'yes' }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Active" htmlFor="active">
                <select
                  id="active"
                  value={form.active ? 'yes' : 'no'}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.value === 'yes' }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </FieldGroup>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-6 py-4 sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (isEdit && !record)}
              className="rounded-lg bg-[#1C0770] px-4 py-2 text-sm font-medium text-white hover:bg-[#150558] disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
