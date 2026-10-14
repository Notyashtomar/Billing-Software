import 'client-only';

export async function getXLSXModule() {
  return import('xlsx');
}
