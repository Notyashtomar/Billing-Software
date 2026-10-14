import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal } from 'src/auth/services/identity.service';
import {
  buildStationScope,
  type StationScopeContext,
} from 'src/common/station/station-scope';
import { extractClientIp } from 'src/admin-audit/utils/parse-user-agent.util';
import type { BillingActor } from '../services/billing-customers.service';

type BillingRequest = {
  user?: AuthenticatedPrincipal;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

function header(
  headers: BillingRequest['headers'],
  name: string,
): string | undefined {
  const value = headers?.[name];
  const text = Array.isArray(value) ? value[0] : value;
  return String(text ?? '').trim() || undefined;
}

/** FRIS session station scope for billing controllers. */
export const CurrentBillingStation = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StationScopeContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedPrincipal }>();
    return buildStationScope(request.user);
  },
);

export const CurrentBillingActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BillingActor => {
    const request = ctx.switchToHttp().getRequest<BillingRequest>();
    const user = request.user;
    const headers = request.headers ?? {};
    const userId = String(user?.userId ?? user?.id ?? '').trim() || 'system';
    const loginId = String(user?.userid ?? '').trim() || undefined;
    const stationCode = String(user?.stationCode ?? '').trim() || undefined;
    const correlationId = header(headers, 'x-correlation-id');
    return {
      userId,
      userName: String(user?.name ?? loginId ?? user?.email ?? 'System'),
      loginId,
      userEmail: String(user?.email ?? '').trim() || undefined,
      role: String(user?.role ?? '').trim() || undefined,
      accountType: user?.accountType,
      stationId: String(user?.stationId ?? '').trim() || undefined,
      stationCode,
      stationName: stationCode,
      ipAddress:
        extractClientIp(headers) ||
        String(request.ip ?? request.socket?.remoteAddress ?? '').trim() ||
        undefined,
      userAgent: header(headers, 'user-agent'),
      requestId: header(headers, 'x-request-id') ?? correlationId,
      correlationId,
    };
  },
);
