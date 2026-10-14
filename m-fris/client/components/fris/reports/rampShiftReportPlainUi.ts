/**
 * Ramp shift report layout shared by web view + print.
 * Uses the same indigo palette as the PDF export.
 */
export const rampReport = {
  page: 'min-h-[calc(100vh-3rem)] bg-white px-2 pb-12 pt-3 text-black print:min-h-0 print:p-0 sm:px-4',
  maxWidth: 'mx-auto max-w-[100rem]',
  headerBar:
    'mb-4 flex flex-col gap-3 border-b border-indigo-200 pb-4 sm:flex-row sm:items-center sm:justify-between print:hidden',
  linkBack: 'text-sm font-medium text-indigo-800 underline hover:text-indigo-950',
  btnRow: 'flex flex-wrap items-center gap-2',
  btn:
    'rounded border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-950 hover:bg-indigo-50',
  btnPrimary:
    'rounded border border-indigo-700 bg-indigo-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-800',
  docTitleBar:
    'mb-3 border border-indigo-200 bg-indigo-900 px-3 py-2 text-center text-lg font-bold text-white sm:text-xl',
  reportDocHeader:
    'mb-4 grid grid-cols-1 items-center gap-4 border border-indigo-200 bg-white p-3 sm:grid-cols-[minmax(0,9rem)_1fr_minmax(0,14rem)] sm:gap-3 print:grid-cols-[minmax(0,9rem)_1fr_minmax(0,14rem)]',
  reportDocLogo: 'mx-auto h-auto w-full max-w-[9rem] object-contain sm:mx-0',
  reportDocTitle:
    'text-center text-lg font-bold leading-snug text-black sm:text-xl print:text-xl',
  reportDocDetails: 'space-y-0.5 text-xs text-black sm:text-right sm:text-sm',
  reportDocDetailRow: 'flex flex-col gap-0.5 sm:flex-row sm:justify-end sm:gap-1',
  reportDocDetailLabel: 'shrink-0 font-bold',
  reportDocDetailValue: 'min-w-0 break-words',
  metaTable: 'mb-4 w-full border-collapse border border-indigo-200 text-sm',
  metaTh:
    'w-[10rem] border border-indigo-200 bg-indigo-100 px-2 py-1.5 text-left font-bold text-black',
  metaTd: 'border border-indigo-200 px-2 py-1.5 text-black',
  sectionBar:
    'border border-indigo-200 border-b-0 bg-indigo-900 px-2 py-1.5 text-center text-sm font-bold text-white',
  tableWrap: 'mb-4 overflow-x-auto overscroll-x-contain touch-pan-x border border-indigo-200 print:overflow-visible',
  table: 'w-full border-collapse border border-indigo-200 text-xs text-black',
  th: 'border border-indigo-200 bg-indigo-900 px-1 py-1 text-center font-bold text-white align-middle whitespace-nowrap',
  thLeft: 'border border-indigo-200 bg-indigo-900 px-1.5 py-1 text-left font-bold text-white align-middle',
  td: 'border border-indigo-200 px-1 py-0.5 text-center align-top text-black',
  tdLeft: 'border border-indigo-200 px-1.5 py-0.5 text-left align-top text-black',
  tdGreen:
    'border border-indigo-200 bg-indigo-50 px-1 py-0.5 text-center align-top whitespace-pre-line text-black',
  resourcesTitleTh:
    'border border-indigo-200 bg-indigo-900 px-2 py-1.5 text-center text-sm font-bold text-white',
  descTh:
    'sticky left-0 z-10 w-[6.25rem] max-w-[6.25rem] border border-indigo-200 bg-indigo-900 px-1.5 py-1 text-center text-[11px] font-bold text-white sm:w-32 sm:max-w-[8rem]',
  resourcesSubTh:
    'border border-indigo-200 bg-indigo-700 px-1 py-0.5 text-center text-[10px] font-semibold text-white whitespace-nowrap',
  descTd:
    'sticky left-0 z-10 w-[6.25rem] max-w-[6.25rem] border border-indigo-200 bg-indigo-100 px-1.5 py-0.5 text-left text-[11px] font-semibold text-black sm:w-32 sm:max-w-[8rem]',
  resourcesTd: 'border border-indigo-200 px-1 py-0.5 text-center align-middle text-[11px] text-black',
  resourcesTdAlt:
    'border border-indigo-200 bg-indigo-50 px-1 py-0.5 text-center align-middle text-[11px] text-black',
  indicatorWrap: 'mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2',
  indicatorCol: 'flex min-w-0 flex-col gap-3',
  indicatorBox: 'border border-indigo-200',
  indicatorTitle:
    'border-b border-indigo-200 bg-indigo-900 px-2 py-1 text-center text-xs font-bold text-white',
  indicatorTable: 'w-full border-collapse text-xs',
  indicatorTh: 'border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-left font-semibold',
  indicatorTd: 'border border-indigo-200 px-2 py-0.5 text-right',
  indicatorTotal: 'border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-right font-bold',
  notesGrid: 'mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch',
  notesBox: 'flex flex-col border border-indigo-200',
  notesTitle:
    'flex min-h-[3.75rem] items-center justify-center border-b border-indigo-200 bg-indigo-900 px-2 py-1.5 text-center text-xs font-bold leading-snug text-white',
  notesBody:
    'min-h-[12rem] flex-1 whitespace-pre-wrap px-2 py-2 text-xs leading-relaxed text-black',
  empty: 'px-4 py-6 text-center text-sm text-neutral-600',
  panel:
    'rounded border border-indigo-200 bg-indigo-50/40 p-6 text-sm text-neutral-700 shadow-sm',
  spinner: 'inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-700 border-t-transparent',
} as const;
