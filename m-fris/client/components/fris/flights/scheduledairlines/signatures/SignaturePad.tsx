'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { RotateCcw, Eye } from 'lucide-react';

export interface SignaturePadProps {
  /** Existing signature as a PNG data URL (loaded from server). */
  value?: string;
  /** Fires with the new PNG data URL while drawing, or '' when cleared. */
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  isDark?: boolean;
  height?: number;
  placeholder?: string;
  /** Opens a larger preview of the current signature. */
  onPreview?: (dataUrl: string) => void;
}

const PEN_DARK = '#e2e8f0';
const PEN_LIGHT = '#0f172a';

/**
 * Responsive signature canvas (mouse + touch) wrapping `react-signature-canvas`.
 * Keeps the drawing intact across container resizes by re-hydrating from the data URL.
 */
export default function SignaturePad({
  value = '',
  onChange,
  disabled = false,
  isDark = false,
  height = 180,
  placeholder = 'Draw signature here',
  onPreview,
}: SignaturePadProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const padRef = useRef<SignatureCanvas | null>(null);
  const [hasInk, setHasInk] = useState<boolean>(Boolean(value));
  const [clientReady, setClientReady] = useState(false);
  const lastValueRef = useRef<string>(value);

  useEffect(() => {
    setClientReady(true);
  }, []);

  const redraw = useCallback((dataUrl: string) => {
    const pad = padRef.current;
    if (!pad) return;
    pad.clear();
    if (dataUrl) {
      // fromDataURL is async-ish (loads an Image); ratio 1 keeps coordinates stable.
      pad.fromDataURL(dataUrl, { ratio: 1 });
      setHasInk(true);
    } else {
      setHasInk(false);
    }
  }, []);

  // Size the canvas to its container; preserve current ink across resizes.
  const resizeCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    const pad = padRef.current;
    if (!wrap || !pad) return;
    const canvas = pad.getCanvas();
    const width = Math.max(wrap.clientWidth, 1);
    const snapshot =
      lastValueRef.current || (pad.isEmpty() ? '' : pad.toDataURL('image/png'));
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (snapshot) redraw(snapshot);
    else pad.clear();
  }, [height, redraw]);

  useEffect(() => {
    resizeCanvas();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  // External value change (load from server / programmatic clear).
  useEffect(() => {
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;
    redraw(value);
  }, [value, redraw]);

  const handleEnd = useCallback(() => {
    const pad = padRef.current;
    if (!pad) return;
    if (pad.isEmpty()) {
      lastValueRef.current = '';
      setHasInk(false);
      onChange('');
      return;
    }
    const dataUrl = pad.toDataURL('image/png');
    lastValueRef.current = dataUrl;
    setHasInk(true);
    onChange(dataUrl);
  }, [onChange]);

  const handleClear = useCallback(() => {
    const pad = padRef.current;
    if (pad) pad.clear();
    lastValueRef.current = '';
    setHasInk(false);
    onChange('');
  }, [onChange]);

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const btnLight = 'border border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50';
  const btnDark = 'border border-white/15 bg-white/[0.06] text-slate-200 hover:bg-white/[0.12]';
  const btnCls = `${btnBase} ${isDark ? btnDark : btnLight}`;

  return (
    <div className="w-full">
      <div
        ref={wrapRef}
        className={`relative w-full overflow-hidden rounded-xl border ${
          isDark
            ? 'border-white/15 bg-[#0b101a]'
            : 'border-gray-300 bg-gradient-to-br from-slate-50/80 to-white'
        } ${disabled ? 'opacity-70' : ''}`}
        style={{ height }}
      >
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              {placeholder}
            </span>
          </div>
        )}
        {clientReady ? (
          <SignatureCanvas
            ref={padRef}
            penColor={isDark ? PEN_DARK : PEN_LIGHT}
            onEnd={handleEnd}
            canvasProps={{
              className: 'h-full w-full touch-none',
              style: { touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' },
            }}
            clearOnResize={false}
          />
        ) : null}
        {disabled && <div className="absolute inset-0 z-10 cursor-not-allowed" aria-hidden />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={btnCls} onClick={handleClear} disabled={disabled || !hasInk}>
          <RotateCcw className="h-3.5 w-3.5" />
          Capture Again
        </button>
        <button
          type="button"
          className={btnCls}
          onClick={() => onPreview?.(lastValueRef.current || value)}
          disabled={!hasInk || !onPreview}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview Signature
        </button>
      </div>
    </div>
  );
}
