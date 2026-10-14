/**
 * Shared Non-Scheduled Booking layout (amber theme).
 * Mobile-first: 1-col forms, 44px+ touch targets, full-width CTAs on phone.
 */

export const BOOKING_FORM_CARD =
  'overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm';

export const BOOKING_FORM_HEADER =
  'bg-amber-500 px-3 py-2.5 sm:px-5';

export const BOOKING_FORM_INNER = 'space-y-4 p-3 sm:space-y-5 sm:p-5';

export const BOOKING_FORM_GRID =
  'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4';

export const BOOKING_FORM_GRID_3 =
  'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4 lg:grid-cols-3';

export const BOOKING_FORM_GRID_4 =
  'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4 lg:grid-cols-4';

/** Filter fields + Get — fields stay equal width; action sits on input baseline. */
export const BOOKING_FILTER_WITH_ACTION =
  'flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:gap-4';

export const BOOKING_FILTER_FIELDS =
  `${BOOKING_FORM_GRID_4} min-w-0 lg:flex-1`;

export const BOOKING_FILTER_ACTION =
  'flex w-full shrink-0 sm:w-auto';

export const BOOKING_LABEL =
  'mb-1.5 block text-sm font-medium text-slate-700';

export const BOOKING_CONTROL =
  'box-border min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 hover:border-amber-300 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:h-10 sm:min-h-10 sm:text-sm';

export const BOOKING_CONTROL_READONLY =
  'box-border min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-base text-slate-600 shadow-sm sm:h-10 sm:min-h-10 sm:text-sm';

export const BOOKING_DROPDOWN = `${BOOKING_CONTROL} cursor-pointer`;

export const BOOKING_RADIO_LABEL =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700 sm:min-h-0';

export const BOOKING_RADIO_INPUT =
  'h-4 w-4 shrink-0 border-slate-300 text-amber-600 focus:ring-amber-500';

export const BOOKING_SAVE_BTN =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white shadow-md shadow-amber-500/25 transition hover:bg-amber-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:min-h-10 sm:w-auto';

export const BOOKING_GET_BTN =
  'inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white shadow-md shadow-amber-500/25 transition hover:bg-amber-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:min-h-10 sm:w-auto';

export const BOOKING_SEARCH_CARD =
  'rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/50 via-white to-white p-3 shadow-sm sm:p-5';

/** Icon-only action buttons — 40px target, label via aria-label / title. */
export const BOOKING_ICON_BTN =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-45';

export const BOOKING_EDIT_BTN =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45';

export const BOOKING_DELETE_BTN =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45';

export const BOOKING_DETAILS_GROUP =
  'rounded-xl border border-amber-100/80 bg-amber-50/20 p-4 sm:p-5';

export const BOOKING_FIELD_WRAP = 'min-w-0';

/** Locks to viewport below fixed navbar — avoids empty scroll / white strip under the page. */
export const BOOKING_PAGE_SHELL =
  'flex h-[calc(100dvh-3rem)] max-h-[calc(100dvh-3rem)] min-h-0 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-amber-50/40';

export const BOOKING_PAGE_BODY =
  'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-4 md:p-6 nav-desktop:flex-row nav-desktop:gap-4';

/** Single scroll region — thin amber scrollbar, no nested page scroll. */
export const BOOKING_SCROLL_AREA =
  'min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [scrollbar-width:thin] [scrollbar-color:rgb(245_158_11)_rgb(255_251_235)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-amber-50/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-400/70 hover:[&::-webkit-scrollbar-thumb]:bg-amber-500/80';

export const BOOKING_TABLE_WRAP =
  'overflow-x-auto rounded-xl border border-amber-100 bg-white shadow-sm [-webkit-overflow-scrolling:touch]';

/** Wide data tables — horizontal scroll + touch pan on phone. */
export const BOOKING_TABLE_SCROLL_REGION =
  'overflow-x-auto overscroll-x-contain rounded-xl border border-amber-200/80 bg-white shadow-sm touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:rgb(217_119_6)_rgb(255_251_235)] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-amber-50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-400/80 hover:[&::-webkit-scrollbar-thumb]:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30';

/** Mobile stacked “card rows” — use below md when tables are too wide. */
export const BOOKING_MOBILE_CARD_LIST =
  'space-y-3 p-3 md:hidden';

export const BOOKING_MOBILE_CARD =
  'rounded-xl border border-amber-100 bg-white p-3 shadow-sm';

export const BOOKING_RESULT_ACTION_BAR =
  'rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-white to-white p-4 shadow-sm sm:p-5';

export const BOOKING_RESULT_SECTION_CARD =
  'overflow-hidden rounded-xl border border-amber-100 bg-white shadow-sm';

export const BOOKING_RESULT_SECTION_HEADER =
  'border-b border-white/20 bg-amber-500 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white';

export const BOOKING_RESULT_FIELD_GRID =
  'grid grid-cols-1 gap-x-5 gap-y-3 p-4 sm:grid-cols-2 sm:gap-y-4 sm:p-5 md:grid-cols-2 lg:grid-cols-3';

export const BOOKING_RESULT_FIELD_LABEL =
  'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

export const BOOKING_RESULT_FIELD_VALUE =
  'mt-0.5 break-words text-sm font-medium text-slate-800';

export const BOOKING_RESULT_BADGE =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900';

export const BOOKING_PASSENGER_CARD =
  'flex items-center gap-3 rounded-xl border border-amber-100 bg-white p-3 shadow-sm sm:p-4';

export const BOOKING_BTN_PRIMARY =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white shadow-md shadow-amber-500/20 transition hover:bg-amber-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:w-auto sm:px-5';

export const BOOKING_BTN_SECONDARY =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 shadow-sm transition hover:border-amber-400 hover:bg-amber-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:w-auto sm:px-5';

export const BOOKING_TABLE =
  'w-full border-collapse text-left text-sm';

export const BOOKING_TABLE_HEAD = 'bg-amber-500 text-white';

export const BOOKING_TABLE_HEAD_SECTION =
  'border-b border-r border-white/20 bg-amber-500 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-white last:border-r-0 sm:px-4';

export const BOOKING_TABLE_HEAD_COL =
  'border-b border-r border-white/20 bg-amber-500 px-3 py-2.5 text-left align-top text-[11px] font-semibold uppercase leading-snug tracking-wide text-white break-words whitespace-normal last:border-r-0 sm:px-4 sm:text-xs';

export const BOOKING_TABLE_TH =
  'whitespace-nowrap border-r border-white/20 bg-amber-500 px-3 py-2.5 text-white last:border-r-0 sm:px-4';

/** Wide column headers — same amber/white as {@link BOOKING_TABLE_HEAD_COL}. */
export const BOOKING_TABLE_TH_WRAP =
  'min-w-[7rem] max-w-[11rem] whitespace-normal break-words border-b border-r border-white/20 bg-amber-500 px-3 py-2.5 text-left align-top text-[11px] font-semibold uppercase leading-snug tracking-wide text-white last:border-r-0 sm:min-w-[8rem] sm:px-4 sm:text-xs';

export const BOOKING_TABLE_TD =
  'border-t border-amber-100/90 bg-white px-3 py-2.5 align-top text-slate-700 break-words whitespace-normal sm:px-4';

/** Same as {@link BOOKING_TABLE_TD} — kept for wide columns in legacy tables. */
export const BOOKING_TABLE_TD_WRAP =
  'min-w-[7rem] max-w-[18rem] break-words whitespace-normal border-t border-amber-100/90 bg-white px-3 py-2.5 align-top text-slate-700 sm:min-w-[8rem] sm:px-4';

/** Action buttons — sticky so Edit/Delete stay clickable on wide tables. */
export const BOOKING_TABLE_TD_ACTIONS =
  'sticky right-0 z-[1] border-t border-l border-amber-100/90 bg-white px-2 py-2.5 align-middle whitespace-nowrap shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.12)] sm:px-3';

export const BOOKING_TABLE_ROW_ALT = '[&>td]:bg-amber-50/50';

export const BOOKING_TABLE_SECTION_LABEL =
  'w-10 min-w-[2.5rem] bg-amber-400 px-1 py-3 text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-white sm:w-12 sm:text-xs';

export const BOOKING_TABLE_SECTION_LABEL_INNER =
  '[writing-mode:vertical-rl] rotate-180 whitespace-nowrap';
