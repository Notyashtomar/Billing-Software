'use client';

/**
 * Per-lib loaders. Keep each import() in its own module so NFT/webpack
 * cannot pull every PDF/Excel package from a single barrel import.
 *
 * Excel (exceljs / xlsx) lives only under `@/lib/dynamic-imports` — not here.
 */

export { loadFileSaverSaveAs } from './lazy-client-deps/file-saver';
export { loadJsPDF } from './lazy-client-deps/jspdf';
export { loadHtml2Canvas } from './lazy-client-deps/html2canvas';
export { loadPdfLib } from './lazy-client-deps/pdf-lib';
export {
  loadGsap,
  loadGsapWithInertia,
  loadGsapWithScrollTrigger,
} from './lazy-client-deps/gsap';
