import { Injectable, Logger } from '@nestjs/common';
import type { ProtectionLogEventName } from './protection-log-events';

export type ProtectionLogFields = Record<
  string,
  string | number | boolean | undefined | null
>;

@Injectable()
export class ProtectionLoggerService {
  private readonly logger = new Logger('Protection');

  logEvent(event: ProtectionLogEventName, fields: ProtectionLogFields = {}): void {
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${String(v)}`);
    const message = `[${event}]${parts.length ? ' ' + parts.join(' ') : ''}`;
    this.logger.warn(message);
  }

  logStartup(event: ProtectionLogEventName, fields: ProtectionLogFields = {}): void {
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${String(v)}`);
    const message = `[${event}]${parts.length ? ' ' + parts.join(' ') : ''}`;
    this.logger.log(message);
  }
}
