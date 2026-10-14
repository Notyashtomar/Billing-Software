import 'client-only';

export async function getPdfLibModule() {
  return import('pdf-lib');
}
