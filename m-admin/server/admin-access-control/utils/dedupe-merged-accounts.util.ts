export function accountDedupeKeys(account: {
  userid?: unknown;
  employeeId?: unknown;
  email?: unknown;
}): string[] {
  const keys: string[] = [];
  const userid = String(account.userid ?? '').trim().toLowerCase();
  if (userid) keys.push(`userid:${userid}`);
  const employeeId = String(account.employeeId ?? '').trim().toLowerCase();
  if (employeeId) keys.push(`employeeId:${employeeId}`);
  const email = String(account.email ?? '').trim().toLowerCase();
  if (email) keys.push(`email:${email}`);
  return keys;
}

/** Prefer `users` rows; drop `admins` shadows that share userid/email/employeeId. */
export function dedupeMergedAccounts<
  T extends {
    userid?: unknown;
    employeeId?: unknown;
    email?: unknown;
  },
>(users: T[], admins: T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  const take = (row: T) => {
    const keys = accountDedupeKeys(row);
    if (keys.some((key) => seen.has(key))) return;
    for (const key of keys) seen.add(key);
    merged.push(row);
  };

  for (const row of users) take(row);
  for (const row of admins) take(row);
  return merged;
}

export function uniqueIdList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = String(value ?? '').trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}
