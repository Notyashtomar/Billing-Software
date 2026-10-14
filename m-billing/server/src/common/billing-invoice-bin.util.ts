/** Invoices with inBin !== true (includes legacy docs without the field). */
export const NOT_IN_BIN_FILTER = { inBin: { $ne: true } };

export const IN_BIN_FILTER = { inBin: true };
