'use client';

export async function loadJsPDF() {
  return (await import('jspdf')).jsPDF;
}
