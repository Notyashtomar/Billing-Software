import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import {
  USER_ACTIVITY_LOG_EVENT,
  type UserActivityLogEventPayload,
} from '../events/user-activity.events';
import {
  deriveAuditLocation,
  deriveClientPageLocation,
  describeUserAction,
  isUntrackedClientPath,
  shouldSkipActionLog,
} from '../utils/describe-user-action.util';
import { humanizeRole } from '../utils/audit-format.util';
import { extractActivityMetadata } from '../utils/extract-activity-metadata.util';
import {
  extractClientIp,
} from '../../admin-audit/utils/parse-user-agent.util';

@Injectable()
export class UserActionLogInterceptor implements NestInterceptor {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: AuthenticatedPrincipal;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
      headers?: Record<string, unknown>;
    }>();

    const method = String(req.method ?? 'GET');
    const path = String(req.originalUrl ?? req.url ?? '');
    const user = req.user;

    return next.handle().pipe(
      tap(() => {
        if (!user?.userId) return;
        if (shouldSkipActionLog(method, path)) return;

        const headers = req.headers ?? {};
        const actorName = String(user.name ?? user.userid ?? user.email ?? 'User');
        const action = describeUserAction(method, path);
        const stationCode = String(user.stationCode ?? '').trim();

        const clientPathHeader = String(
          headers['x-client-path'] ?? headers['X-Client-Path'] ?? '',
        ).trim();
        let clientPath = (clientPathHeader.split('?')[0] ?? '').trim();
        if (!clientPath) {
          const referer = String(headers['referer'] ?? headers['referrer'] ?? '').trim();
          try {
            if (referer) {
              const u = new URL(referer);
              clientPath = u.pathname || '';
            }
          } catch {
            /* ignore bad referer */
          }
        }

        if (isUntrackedClientPath(clientPath)) return;

        const fromClient = clientPath
          ? deriveClientPageLocation(clientPath)
          : { systemId: '', systemLabel: '', module: '', page: '', tab: '' };
        const fromApi = deriveAuditLocation(path);
        const module = fromClient.module || fromApi.module;
        const page = fromClient.page || fromApi.page;
        const tab = fromClient.tab || undefined;

        const summary = stationCode
          ? `${actorName} — ${action} (station ${stationCode}).`
          : `${actorName} — ${action}.`;
        const baseMeta = extractActivityMetadata(req) ?? {};
        const metadata =
          clientPath ||
          fromClient.systemId ||
          Object.keys(baseMeta).length > 0
            ? {
                ...baseMeta,
                ...(clientPath ? { clientPath } : {}),
                ...(fromClient.systemId
                  ? {
                      systemId: fromClient.systemId,
                      systemLabel: fromClient.systemLabel,
                    }
                  : {}),
              }
            : undefined;

        const payload: UserActivityLogEventPayload = {
          userId: String(user.userId),
          userName: actorName,
          userEmail: user.email,
          accountType: user.accountType === 'admin' ? 'admin' : 'user',
          action,
          summary,
          actorRole: humanizeRole(user.role),
          module: module || undefined,
          page: page || undefined,
          tab,
          stationId: String(user.stationId ?? '').trim() || undefined,
          stationName: stationCode || undefined,
          method,
          path,
          metadata,
          ipAddress: extractClientIp(headers),
          userAgent: String(headers['user-agent'] ?? '').trim() || undefined,
          requestId:
            String(headers['x-request-id'] ?? headers['x-correlation-id'] ?? '').trim() ||
            undefined,
          correlationId: String(headers['x-correlation-id'] ?? '').trim() || undefined,
        };

        this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, payload);
      }),
    );
  }
}
