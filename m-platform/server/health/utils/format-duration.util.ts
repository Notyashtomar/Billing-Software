/**
 * Human-readable duration formatting for health diagnostics.
 *
 * Uptime in seconds is precise for monitors; `human` strings (e.g. `3m 14s`)
 * let on-call engineers assess process age instantly from terminal output.
 */
export type FormattedDuration = {
  seconds: number;
  human: string;
};

/**
 * Format seconds into `{ seconds, human }` (e.g. `194` → `"3m 14s"`).
 */
export function formatDuration(totalSeconds: number): FormattedDuration {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return {
    seconds,
    human: parts.join(' '),
  };
}
