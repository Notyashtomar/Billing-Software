import { extname } from 'path';
import {
  ALLOWED_EXCEL_EXTENSIONS,
  ALLOWED_EXCEL_MIME_TYPES,
  MAX_EXCEL_FILE_BYTES,
} from '../constants/flight-import.constants';

export interface ExcelFileValidationResult {
  valid: boolean;
  message?: string;
}

export function validateExcelFile(
  file: Express.Multer.File | undefined,
): ExcelFileValidationResult {
  if (!file) {
    return { valid: false, message: 'No file uploaded.' };
  }

  if (!file.buffer?.length) {
    return { valid: false, message: 'Empty file.' };
  }

  if (file.size > MAX_EXCEL_FILE_BYTES || file.buffer.length > MAX_EXCEL_FILE_BYTES) {
    return { valid: false, message: 'File exceeds maximum size of 5MB.' };
  }

  const ext = extname(String(file.originalname ?? '')).toLowerCase();
  if (!ALLOWED_EXCEL_EXTENSIONS.includes(ext as (typeof ALLOWED_EXCEL_EXTENSIONS)[number])) {
    return {
      valid: false,
      message: `Invalid file extension. Allowed: ${ALLOWED_EXCEL_EXTENSIONS.join(', ')}`,
    };
  }

  const mime = String(file.mimetype ?? '').toLowerCase();
  if (mime && !ALLOWED_EXCEL_MIME_TYPES.has(mime)) {
    return {
      valid: false,
      message: `Invalid MIME type "${mime}". Upload a valid Excel file.`,
    };
  }

  return { valid: true };
}
