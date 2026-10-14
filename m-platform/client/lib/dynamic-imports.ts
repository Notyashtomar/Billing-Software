/** Tree-shakeable re-exports — each consumer only NFT-traces the libs it imports. */
export { getExcelJSModule } from './dynamic-imports/exceljs';
export { getJsPDFConstructor } from './dynamic-imports/jspdf';
export { getHtml2Canvas } from './dynamic-imports/html2canvas';
export { getPdfLibModule } from './dynamic-imports/pdf-lib';
export { getXLSXModule } from './dynamic-imports/xlsx';
export { getFileSaverSaveAs } from './dynamic-imports/file-saver';
export {
  getGsapModule,
  getGsapWithInertiaPlugin,
  getGsapWithScrollTrigger,
} from './dynamic-imports/gsap';
