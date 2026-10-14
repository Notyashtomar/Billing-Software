import 'client-only';

export async function getJsPDFConstructor() {
  return (await import('jspdf')).jsPDF;
}
