/** Build a short department-code prefix from the department name (e.g. "Operations" → "OPS"). */
export function departmentCodePrefix(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'DEP';

  const words = trimmed.split(/[\s&/,-]+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 3)
      .padEnd(3, 'X');
  }

  const single = words[0] ?? trimmed;
  const alpha = single.replace(/[^a-zA-Z]/g, '');
  const source = alpha.length >= 3 ? alpha : single;
  return source.slice(0, 3).toUpperCase().padEnd(3, 'X');
}

/** Next sequential code for a department name, e.g. OPS-001, OPS-002. */
export function nextDepartmentCodeForName(
  name: string,
  existingCodes: string[],
): string {
  const prefix = departmentCodePrefix(name);
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let maxSeq = 0;

  for (const code of existingCodes) {
    const match = code.trim().match(pattern);
    if (match) {
      maxSeq = Math.max(maxSeq, Number.parseInt(match[1] ?? '0', 10));
    }
  }

  return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}`;
}
