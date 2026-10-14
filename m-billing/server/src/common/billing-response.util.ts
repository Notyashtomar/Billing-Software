export function successResponse<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
  extraMeta?: Record<string, unknown>,
) {
  return successResponse(items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    ...extraMeta,
  });
}

export function parsePagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  // Dropdowns (customers, etc.) need the full station list — 200 was truncating
  // airlines past ~S (e.g. SpiceJet) when sorted by name.
  const limit = Math.min(5000, Math.max(1, parseInt(query.limit ?? '50', 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
}
