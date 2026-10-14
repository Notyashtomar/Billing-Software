'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, FileUp, Trash2 } from 'lucide-react';
import { ContractAlert, contractUi } from './ContractUi';
import { cn } from '@/lib/utils';

export type ContractPdfState = {
  fileName: string;
  contentType: string;
  base64: string;
  uploadedAt?: string;
};

const MAX_PDF_BYTES = 5 * 1024 * 1024;

type Props = {
  value: ContractPdfState | null;
  onChange: (next: ContractPdfState | null) => void;
  disabled?: boolean;
};

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType || 'application/pdf' });
}

export function ContractPdfPanel({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const objectUrl = useMemo(() => {
    if (!value?.base64) return null;
    try {
      return URL.createObjectURL(base64ToBlob(value.base64, value.contentType));
    } catch {
      return null;
    }
  }, [value?.base64, value?.contentType]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const onPickFile = async (file: File | null) => {
    setError('');
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Upload a PDF file only.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('PDF must be 5 MB or smaller.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      onChange({
        fileName: file.name,
        contentType: file.type || 'application/pdf',
        base64,
        uploadedAt: new Date().toISOString(),
      });
      setPreviewOpen(true);
    } catch {
      setError('Could not read that PDF. Try another file.');
    }
  };

  const download = () => {
    if (!value?.base64 || !objectUrl) return;
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = value.fileName || 'contract.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div className="space-y-4">
      {error ? <ContractAlert tone="danger">{error}</ContractAlert> : null}

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Contract PDF</p>
            <p className="mt-0.5 text-xs text-slate-600">
              Upload the signed agreement (PDF, max 5 MB). Preview and download stay on this
              contract.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                void onPickFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className={contractUi.btnPrimary}
            >
              <FileUp className="h-4 w-4" aria-hidden />
              {value ? 'Replace PDF' : 'Upload PDF'}
            </button>
            {value ? (
              <>
                <button
                  type="button"
                  disabled={!objectUrl}
                  onClick={() => setPreviewOpen((open) => !open)}
                  className={contractUi.btnSecondary}
                >
                  <Eye className="h-4 w-4" aria-hidden />
                  {previewOpen ? 'Hide preview' : 'Preview'}
                </button>
                <button
                  type="button"
                  disabled={!objectUrl}
                  onClick={download}
                  className={contractUi.btnOutline}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(null);
                    setPreviewOpen(false);
                    setError('');
                  }}
                  className={contractUi.btnDangerOutline}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove
                </button>
              </>
            ) : null}
          </div>
        </div>

        {value ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm">
            <p className="font-semibold text-slate-900">{value.fileName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {value.contentType || 'application/pdf'}
              {value.uploadedAt
                ? ` · uploaded ${String(value.uploadedAt).slice(0, 19).replace('T', ' ')}`
                : null}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No contract PDF uploaded yet.</p>
        )}
      </div>

      {value && previewOpen && objectUrl ? (
        <div
          className={cn(
            'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs',
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              PDF preview
            </p>
            <button
              type="button"
              onClick={download}
              className={contractUi.btnGhost}
            >
              <Download className="h-4 w-4" aria-hidden />
              Download
            </button>
          </div>
          <iframe
            title={`Preview ${value.fileName}`}
            src={objectUrl}
            className="h-[min(70vh,36rem)] w-full bg-slate-100"
          />
        </div>
      ) : null}
    </div>
  );
}
