import 'client-only';

export async function getExcelJSModule() {
  const mod = await import('exceljs');
  return mod.default ?? mod;
}
