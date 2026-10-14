'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  RemoveFormatting,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ToolbarButton = {
  label: string;
  icon: LucideIcon;
  command: string;
  value?: string;
};

const TOOLBAR: ToolbarButton[] = [
  { label: 'Bold', icon: Bold, command: 'bold' },
  { label: 'Italic', icon: Italic, command: 'italic' },
  { label: 'Underline', icon: Underline, command: 'underline' },
  { label: 'Strikethrough', icon: Strikethrough, command: 'strikeThrough' },
  { label: 'Bullet list', icon: List, command: 'insertUnorderedList' },
  { label: 'Numbered list', icon: ListOrdered, command: 'insertOrderedList' },
  { label: 'Clear formatting', icon: RemoveFormatting, command: 'removeFormat' },
];

function isHtmlEmpty(html: string): boolean {
  const stripped = html
    .replace(/<br\s*\/?>(\s*)?/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, '')
    .trim();
  return stripped.length === 0;
}

type RichTextEditorProps = {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  minHeightClassName?: string;
};

/** Lightweight dependency-free WYSIWYG editor. Stores HTML; plain-text input renders fine. */
export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  minHeightClassName = 'min-h-[12rem]',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(() => isHtmlEmpty(value || ''));

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || '';
    }
    setIsEmpty(isHtmlEmpty(el.innerHTML));
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    setIsEmpty(isHtmlEmpty(html));
    onChange(html);
  }, [onChange]);

  const exec = useCallback(
    (command: string, val?: string) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      document.execCommand(command, false, val);
      handleInput();
    },
    [handleInput],
  );

  return (
    <div className={cn('flex flex-1 flex-col', className)}>
      <div
        className="flex flex-wrap items-center gap-1 border-b border-emerald-100/80 bg-emerald-50/60 px-2 py-1.5"
        role="toolbar"
        aria-label="Text formatting"
      >
        {TOOLBAR.map((btn) => {
          const Icon = btn.icon;
          return (
            <button
              key={btn.command}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(btn.command, btn.value)}
              title={btn.label}
              aria-label={btn.label}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-emerald-100/70 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <Icon className="h-4 w-4" aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="relative flex flex-1 flex-col">
        {isEmpty && placeholder ? (
          <span className="pointer-events-none absolute left-3 top-2.5 z-0 select-none text-sm text-slate-400">
            {placeholder}
          </span>
        ) : null}
        <div
          id={id}
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          className={cn(
            'rte-content relative z-[1] w-full flex-1 resize-y overflow-auto px-3 py-2.5 text-sm leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-200/60',
            minHeightClassName,
          )}
        />
      </div>
    </div>
  );
}

export default RichTextEditor;
