import { getApiBase } from '@/lib/getApiBase';
import { ADMIN_COMPANIES_FALLBACK } from '@/lib/org-structure-options';

export type AdminCompanyOption = {
  name: string;
  sortOrder: number;
};

export async function fetchCompanyOptions(): Promise<string[]> {
  try {
    const res = await fetch(`${getApiBase()}/admin-companies/options`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to load companies: ${res.status}`);
    }
    const data = (await res.json()) as AdminCompanyOption[];
    const rows = Array.isArray(data) ? data : [];
    const names = rows
      .map((row) => String(row.name ?? '').trim())
      .filter(Boolean);
    if (names.length) return names;
  } catch {
    // Fall back to bundled list when API is unavailable (e.g. offline dev).
  }
  return [...ADMIN_COMPANIES_FALLBACK];
}
