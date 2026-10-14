import type { CapturedProtectionLog } from './protection-log-capture';
import { ProtectionLogEvent } from '../../src/protection/logging/protection-log-events';

const SENSITIVE_PATTERNS = [
  /password=/i,
  /Bearer\s+/i,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
  /JWT_SECRET/i,
];

export function assertLogEvent(
  logs: CapturedProtectionLog[],
  event: string,
  requiredFields: string[] = [],
): CapturedProtectionLog {
  const match = logs.find((l) => l.event === event);
  if (!match) {
    throw new Error(
      `Expected log event [${event}], got: ${logs.map((l) => l.event).join(', ') || '(none)'}`,
    );
  }
  for (const field of requiredFields) {
    if (match.fields[field] === undefined && !match.raw.includes(`${field}=`)) {
      throw new Error(`Log [${event}] missing field: ${field}`);
    }
  }
  assertNoSensitiveData(match.raw);
  return match;
}

export function assertNoSensitiveData(line: string): void {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(line)) {
      throw new Error(`Sensitive data leaked in log line: ${line}`);
    }
  }
}

export function assertNoUnexpected429(statuses: number[]): void {
  const blocked = statuses.filter((s) => s === 429);
  if (blocked.length > 0) {
    throw new Error(
      `Unexpected 429 responses (${blocked.length}/${statuses.length})`,
    );
  }
}

export function assertEnforcement429Body(body: Record<string, unknown>): void {
  expect(body.statusCode).toBe(429);
  expect(String(body.message).toLowerCase()).toContain('too many requests');
  expect(typeof body.retryAfter).toBe('number');
  expect((body.retryAfter as number) >= 1).toBe(true);
}

export const ALL_PROTECTION_EVENTS = Object.values(ProtectionLogEvent);
