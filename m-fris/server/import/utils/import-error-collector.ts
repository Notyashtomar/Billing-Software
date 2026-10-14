export interface ImportValidationError {
  row: number;
  column: string;
  value: unknown;
  message: string;
  type?: string;
}

export interface HeaderValidationErrorPayload {
  type: 'HEADER_VALIDATION_FAILED';
  missingHeaders: string[];
  duplicateHeaders: string[];
  message?: string;
}

export class ImportErrorCollector {
  private readonly errors: ImportValidationError[] = [];

  add(error: ImportValidationError): void {
    this.errors.push(error);
  }

  addMany(errors: ImportValidationError[]): void {
    this.errors.push(...errors);
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): ImportValidationError[] {
    return [...this.errors];
  }

  getFailedRowNumbers(): Set<number> {
    return new Set(this.errors.map((e) => e.row));
  }

  countFailedRows(): number {
    return this.getFailedRowNumbers().size;
  }
}
