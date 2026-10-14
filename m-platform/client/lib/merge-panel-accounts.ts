/** Identity keys used to collapse the dual-written user + admin shadow. */
export function panelAccountDedupeKeys(account: {
  userid?: string;
  employeeId?: string;
  email?: string;
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

/**
 * Managers/superadmins are stored in `users` and mirrored into `admins` for
 * admin-panel login. Listing both collections without this merge shows the
 * same person twice.
 *
 * Prefer the `users` row; keep admin-only accounts (legacy superadmins).
 */
export function mergePanelAccounts<
  T extends {
    userid?: string;
    employeeId?: string;
    email?: string;
  },
  U extends {
    userid?: string;
    employeeId?: string;
    email?: string;
  },
>(users: T[], admins: U[]): Array<T | U> {
  const seen = new Set<string>();
  const merged: Array<T | U> = [];

  const take = (row: T | U) => {
    const keys = panelAccountDedupeKeys(row);
    if (keys.some((key) => seen.has(key))) return;
    for (const key of keys) seen.add(key);
    merged.push(row);
  };

  for (const row of users) take(row);
  for (const row of admins) take(row);
  return merged;
}
