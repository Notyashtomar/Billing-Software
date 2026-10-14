'use client';

export async function loadHtml2Canvas() {
  return (await import('html2canvas')).default;
}
