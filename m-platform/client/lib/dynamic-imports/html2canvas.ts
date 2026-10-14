import 'client-only';

export async function getHtml2Canvas() {
  return (await import('html2canvas')).default;
}
