import { Injectable, Logger } from '@nestjs/common';
import type { ProtectionLogEventName } from '../../src/protection/logging/protection-log-events';
import type { ProtectionLogFields } from '../../src/protection/logging/protection-logger.service';

export type CapturedProtectionLog = {
  event: ProtectionLogEventName;
  fields: ProtectionLogFields;
  raw: string;
  level: 'log' | 'warn';
};

@Injectable()
export class CapturingProtectionLogger {
  readonly entries: CapturedProtectionLog[] = [];
  private readonly logger = new Logger('Protection');

  logEvent(event: ProtectionLogEventName, fields: ProtectionLogFields = {}): void {
    const raw = this.format(event, fields);
    this.entries.push({ event, fields, raw, level: 'warn' });
    this.logger.warn(raw);
  }

  logStartup(event: ProtectionLogEventName, fields: ProtectionLogFields = {}): void {
    const raw = this.format(event, fields);
    this.entries.push({ event, fields, raw, level: 'log' });
    this.logger.log(raw);
  }

  clear(): void {
    this.entries.length = 0;
  }

  find(event: ProtectionLogEventName): CapturedProtectionLog[] {
    return this.entries.filter((e) => e.event === event);
  }

  last(event: ProtectionLogEventName): CapturedProtectionLog | undefined {
    const matches = this.find(event);
    return matches[matches.length - 1];
  }

  private format(
    event: ProtectionLogEventName,
    fields: ProtectionLogFields,
  ): string {
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${String(v)}`);
    return `[${event}]${parts.length ? ' ' + parts.join(' ') : ''}`;
  }
}
