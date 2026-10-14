'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Download, FileText, Loader2, Mail, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { PageLoading } from '@/components/ui/PageLoading';
import { loadLogoAsBase64 } from '../scheduledairlines/reportPdfUtils';
import {
  formatInrAmount,
  readNsAdvanceInvoicePrefill,
  type NonScheduledAdvanceInvoiceData,
} from './nonScheduledAdvanceInvoice';
import {
  buildNsInvoiceModel,
  formatInrRounded,
  type NsInvoiceModel,
} from './nonScheduledInvoiceModel';

const CELL = 'px-2 py-1 align-top';
const LABEL_CELL = `${CELL} text-slate-700`;
const VALUE_CELL = `${CELL} font-semibold text-slate-900`;

function LabelValueRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[46%_54%] ${last ? '' : 'border-b border-black'}`}
    >
      <div className={`${LABEL_CELL} border-r border-black`}>{label}</div>
      <div className={VALUE_CELL}>{value}</div>
    </div>
  );
}

function InvoiceDocument({
  data,
  model,
}: {
  data: NonScheduledAdvanceInvoiceData;
  model: NsInvoiceModel;
}) {
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  useEffect(() => {
    void loadLogoAsBase64().then(setLogoBase64);
  }, []);

  const { company, billTo, totals } = model;

  return (
    <div
      id="ns-advance-invoice-content"
      className="bg-white p-4 text-[11px] leading-tight text-slate-900 shadow sm:p-6 print:p-0 print:shadow-none"
    >
      <header className="mb-3 flex items-center justify-between gap-4">
        {logoBase64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoBase64} alt="Company logo" className="h-10 object-contain" />
        ) : (
          <span className="text-sm font-bold">BIRD AIRPORT SERVICES</span>
        )}
        <h2 className="flex-1 text-center text-base font-bold tracking-wide sm:text-lg">
          {model.title}
        </h2>
        <span className="w-20 text-right text-[10px] text-slate-500">
          {data.currency}
        </span>
      </header>

      <section className="border border-black">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="border-b border-black sm:border-b-0 sm:border-r">
            <div className="border-b border-black p-2">
              <p className="text-[12px] font-bold uppercase">{company.name}</p>
              {company.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {company.phone ? <p>Phone No.: {company.phone}</p> : null}
            </div>
            <div className="border-b border-black p-2">
              <p className="font-bold underline">Bill To:</p>
              <p className="mt-0.5 text-[12px] font-bold uppercase">{billTo.name}</p>
              {billTo.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="border-b border-black px-2 py-1">
              State Code: <span className="font-semibold">{billTo.stateCode}</span>
            </div>
            <div className="px-2 py-1 font-semibold">
              GSTIN/UIN : {billTo.gstin} &nbsp;&nbsp; PAN No. : {billTo.pan}
            </div>
          </div>

          <div>
            {model.metaRows.map(([label, value]) => (
              <LabelValueRow key={label} label={label} value={value} />
            ))}
            {model.serviceRows.map(([label, value], i) => (
              <LabelValueRow
                key={label}
                label={label}
                value={value}
                last={i === model.serviceRows.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      {model.flightRows.length > 0 ? (
        <section className="mt-3 border border-black">
          <p className="border-b border-black bg-slate-100 px-2 py-1 font-bold uppercase">
            Booking &amp; Flight Details
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-3">
            {model.flightRows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[45%_55%] border-b border-black last:border-b-0 sm:border-r sm:[&:nth-child(3n)]:border-r-0"
              >
                <dt className={`${LABEL_CELL} border-r border-black`}>{label}</dt>
                <dd className={VALUE_CELL}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-[10.5px]">
          <thead>
            <tr>
              <th className="w-[6%] border border-black px-1 py-1.5">Sr. No.</th>
              <th className="w-[34%] border border-black px-1 py-1.5">Particular</th>
              <th className="w-[7%] border border-black px-1 py-1.5">Used</th>
              <th className="w-[8%] border border-black px-1 py-1.5">Charged</th>
              <th className="w-[12%] border border-black px-1 py-1.5">Aircraft Type</th>
              <th className="w-[10%] border border-black px-1 py-1.5">Unit</th>
              <th className="w-[11%] border border-black px-1 py-1.5">Rate/Unit (INR)</th>
              <th className="w-[12%] border border-black px-1 py-1.5">Amount(INR)</th>
            </tr>
          </thead>
          <tbody>
            {model.lines.map((line) => (
              <tr key={line.srNo}>
                <td className="border border-black px-1 py-2 text-center">{line.srNo}</td>
                <td className="border border-black px-1 py-2">{line.particular}</td>
                <td className="border border-black px-1 py-2 text-right">{line.used}</td>
                <td className="border border-black px-1 py-2 text-right">{line.charged}</td>
                <td className="border border-black px-1 py-2">{line.aircraftType}</td>
                <td className="border border-black px-1 py-2">{line.unit}</td>
                <td className="border border-black px-1 py-2 text-right">{line.rate}</td>
                <td className="border border-black px-1 py-2 text-right">{line.amount}</td>
              </tr>
            ))}
            {model.totalRows.map((row) => (
              <tr key={row.label}>
                <td colSpan={7} className="border border-black px-2 py-1">
                  <span className="float-left">{row.prefix ?? ''}</span>
                  <span className={`block text-right ${row.bold ? 'font-bold' : ''}`}>
                    {row.label}
                  </span>
                </td>
                <td
                  className={`border border-black px-1 py-1 text-right ${
                    row.bold ? 'font-bold' : ''
                  }`}
                >
                  {row.value}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={7} className="border border-black px-2 py-2 font-bold">
                Total Amount Receivable In Words- {totals.amountInWords} (In INR) (Rounded
                Off)
              </td>
              <td className="border border-black px-1 py-2 text-right text-[12px] font-bold">
                {formatInrRounded(totals.roundedTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mt-3">
        <p className="font-bold underline">Terms &amp; Conditions:</p>
        <ol className="mt-1 space-y-0.5">
          {model.terms.map((term, i) => (
            <li key={term}>
              {i + 1}) {term}
            </li>
          ))}
        </ol>
      </section>

      {model.bankRows.length > 0 ? (
        <section className="mt-3 border border-black">
          <p className="border-b border-black px-2 py-1 font-bold">
            BENEFICIARY&apos;S BANK ACCOUNT DETAILS FOR PROCESSING PAYMENT : -
          </p>
          {model.bankRows.map(([label, value]) => (
            <p key={label} className="border-b border-black px-2 py-1 last:border-b-0">
              <span className="text-slate-700">{label} </span>
              <span className="font-semibold">{value}</span>
            </p>
          ))}
        </section>
      ) : null}

      <p className="mt-4 text-center text-[10.5px] font-bold">{model.footerNote}</p>
    </div>
  );
}

function NonScheduledAdvanceInvoiceScreenInner() {
  const searchParams = useSearchParams();
  const invoiceHint = searchParams.get('invoiceNo') || undefined;
  const data = useMemo(() => readNsAdvanceInvoicePrefill(invoiceHint), [invoiceHint]);
  const model = useMemo(() => (data ? buildNsInvoiceModel(data) : null), [data]);

  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const { downloadNonScheduledAdvanceInvoicePdf } = await import(
        './nonScheduledAdvanceInvoicePdf'
      );
      await downloadNonScheduledAdvanceInvoicePdf(data);
      toast.success('Invoice PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  }, [data]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleSendToAirline = useCallback(async () => {
    if (!data || !model) return;
    setSending(true);
    try {
      const defaultEmail = data.airlineEmail || '';
      const email =
        typeof window !== 'undefined'
          ? window.prompt(
              'Enter airline email address to send this advance invoice:',
              defaultEmail,
            )
          : null;
      if (email === null) return;
      const trimmed = email.trim();
      if (!trimmed || !trimmed.includes('@')) {
        toast.error('Enter a valid airline email address');
        return;
      }
      const subject = encodeURIComponent(
        `Advance Invoice ${data.invoiceNo} — ${data.airlineBillTo || data.flightNo}`,
      );
      const body = encodeURIComponent(
        [
          `Dear Sir/Madam,`,
          ``,
          `Please find the advance invoice details for Non-Scheduled flight handling:`,
          ``,
          `Invoice No: ${data.invoiceNo}`,
          `Invoice Date: ${data.invoiceDate}`,
          `Booking No: ${data.bookingNo || '—'}`,
          `Airline: ${data.airlineBillTo || '—'}`,
          `Flight No: ${data.flightNo || '—'}`,
          `Basic amount: INR ${formatInrAmount(model.totals.subtotal)}`,
          `Concession fee @ ${model.totals.concessionPercent}%: INR ${formatInrAmount(
            model.totals.concessionFee,
          )}`,
          `CGST + SGST: INR ${formatInrAmount(model.totals.taxTotal)}`,
          `Total receivable (rounded): INR ${formatInrRounded(model.totals.roundedTotal)}`,
          ``,
          `Kindly download the PDF from FRIS (Download PDF) and attach it with this mail if required.`,
          ``,
          `Regards,`,
          model.company.name,
        ].join('\n'),
      );
      window.open(`mailto:${trimmed}?subject=${subject}&body=${body}`, '_blank');
      toast.success('Email draft opened — attach the PDF after download');
    } finally {
      setSending(false);
    }
  }, [data, model]);

  if (!data || !model) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Invoice not found</h1>
          <p className="mt-2 text-sm text-slate-500">
            Open Generate Invoice again from the Non-Scheduled booking form. Preview data is
            kept only for this browser session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 print:bg-white print:px-0 print:py-0 sm:px-4">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-lg print:hidden sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-800 p-3 text-white">
              <FileText className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Advance Invoice</h1>
              <p className="text-sm text-slate-500 break-all">{data.invoiceNo}</p>
              <p className="text-sm font-semibold text-slate-700">
                Total receivable: INR {formatInrRounded(model.totals.roundedTotal)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-[0.98]"
            >
              <Printer className="h-4 w-4" aria-hidden />
              Print
            </button>
            <button
              type="button"
              onClick={() => void handleSendToAirline()}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50 active:scale-[0.98]"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Mail className="h-4 w-4" aria-hidden />
              )}
              Send to Airline
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-900 disabled:opacity-50 active:scale-[0.98]"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" aria-hidden />
                  Download PDF
                </>
              )}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <InvoiceDocument data={data} model={model} />
        </motion.div>
      </div>
    </div>
  );
}

export default function NonScheduledAdvanceInvoiceScreen() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NonScheduledAdvanceInvoiceScreenInner />
    </Suspense>
  );
}
