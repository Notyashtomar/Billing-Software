import { UnauthorizedException } from '@nestjs/common';

export function normalizeTokenVersion(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function assertTokenVersionMatches(
  payloadVersion: unknown,
  storedVersion: unknown,
): void {
  const jwtVersion = normalizeTokenVersion(payloadVersion);
  const dbVersion = normalizeTokenVersion(storedVersion);
  if (jwtVersion !== dbVersion) {
    throw new UnauthorizedException('Session invalidated');
  }
}

export function nextTokenVersion(current: unknown): number {
  return normalizeTokenVersion(current) + 1;
}
