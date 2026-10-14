export const PANEL_USER_ADM_COUNTER_KEY = 'panel_user_adm';
export const PANEL_USER_ADM_NUMBER_START = 100001;

/** Numeric admin ID string (e.g. `100001`). */
export function formatPanelUserAdmNumber(seq: number): string {
  return String(seq);
}

export function parsePanelUserAdmSeq(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const legacy = /^ADM-(\d+)$/i.exec(raw);
  const digits = legacy?.[1] ?? (/^\d+$/.test(raw) ? raw : null);
  if (!digits) return null;
  const seq = Number(digits);
  if (!Number.isFinite(seq) || seq < PANEL_USER_ADM_NUMBER_START) return null;
  return seq;
}

export function isPanelUserAdmNumber(value: unknown): boolean {
  return parsePanelUserAdmSeq(value) != null;
}

export function normalizePanelUserAdmNumberValue(value: unknown): string | null {
  const seq = parsePanelUserAdmSeq(value);
  return seq == null ? null : formatPanelUserAdmNumber(seq);
}
