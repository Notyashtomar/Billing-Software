/** Escape string for safe use inside MongoDB `$regex` (user-supplied search text). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
