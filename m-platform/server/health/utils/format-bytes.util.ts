/**
 * Human-readable byte formatting for health diagnostics.
 *
 * Operators scanning `curl` output should not mentally divide by 1024/1e6 —
 * `human` labels make heap spikes obvious at a glance. Raw `bytes` stay for
 * alerting thresholds, dashboards, and automated comparisons.
 */
export type FormattedBytes = {
  bytes: number;
  human: string;
};

const KB = 1_000;
const MB = KB * 1_000;
const GB = MB * 1_000;

function formatNumber(value: number, suffix: string, approximate: boolean): string {
  const rounded =
    suffix === 'GB' && value < 10
      ? Math.round(value * 10) / 10
      : Math.round(value);

  const label =
    suffix === 'GB' && value < 10 && !Number.isInteger(rounded)
      ? `${rounded.toFixed(1)} ${suffix}`
      : `${rounded} ${suffix}`;

  if (approximate) {
    return `~${label}`;
  }
  return label;
}

/**
 * Format a byte count into `{ bytes, human }`.
 * Uses decimal KB/MB/GB (1_000-based) for operator-friendly labels.
 */
export function formatBytes(bytes: number): FormattedBytes {
  const normalized = Math.max(0, Math.floor(Number(bytes) || 0));

  if (normalized < KB) {
    return { bytes: normalized, human: `${normalized} Bytes` };
  }

  if (normalized < MB) {
    const value = normalized / KB;
    const rounded = Math.round(value);
    const approximate = Math.abs(value - rounded) >= 0.05;
    return {
      bytes: normalized,
      human: approximate
        ? `~${Math.round(value * 10) / 10} KB`
        : `${rounded} KB`,
    };
  }

  if (normalized < GB) {
    const value = normalized / MB;
    const floored = Math.floor(value);
    const approximate = Math.abs(value - floored) > 0.001;
    return {
      bytes: normalized,
      human: approximate ? `~${floored} MB` : `${floored} MB`,
    };
  }

  const value = normalized / GB;
  return {
    bytes: normalized,
    human: formatNumber(value, 'GB', true),
  };
}

export function formatMemoryFields(fields: Record<string, number>): Record<
  string,
  FormattedBytes
> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, formatBytes(value)]),
  );
}
