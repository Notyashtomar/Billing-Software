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
import type { AdminNotificationPayload } from '../events/admin-notification.events';
import { emitAdminNotification } from '../utils/emit-admin-notification.util';

function stripQuery(path: string): string {
  return String(path ?? '').split('?')[0] || '/';
}

function actorLabel(user?: AuthenticatedPrincipal): string {
  if (!user) return 'User';
  return String(user.name ?? user.userid ?? user.email ?? 'User').trim() || 'User';
}

function pickBodyLabel(body: Record<string, unknown>): string {
  const candidates = [
    body.name,
    body.airlineName,
    body.terminalName,
    body.airlines,
    body.flightNo,
    body.code,
    body.registration,
    body.acType,
    body.equipmentName,
    body.manpowerName,
  ];
  for (const value of candidates) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return 'New record';
}

function pickEntityId(
  body: Record<string, unknown>,
  response: unknown,
): string | undefined {
  const res = response as Record<string, unknown> | null;
  const data = (res?.data ?? res) as Record<string, unknown> | undefined;
  const id =
    data?._id ??
    data?.id ??
    res?.id ??
    body.id ??
    body._id;
  const text = String(id ?? '').trim();
  return text || undefined;
}

@Injectable()
export class AdminMutationNotificationInterceptor implements NestInterceptor {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      body?: Record<string, unknown>;
      user?: AuthenticatedPrincipal;
    }>();

    const method = String(req.method ?? 'GET').toUpperCase();
    const path = stripQuery(String(req.originalUrl ?? req.url ?? '')).toLowerCase();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const user = req.user;

    return next.handle().pipe(
      tap((response) => {
        const payload = this.buildPayload(method, path, body, user, response);
        if (payload) {
          emitAdminNotification(this.eventEmitter, payload);
        }
      }),
    );
  }

  private buildPayload(
    method: string,
    path: string,
    body: Record<string, unknown>,
    user: AuthenticatedPrincipal | undefined,
    response: unknown,
  ): AdminNotificationPayload | null {
    if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT') {
      return null;
    }

    const actor = actorLabel(user);
    const label = pickBodyLabel(body);
    const entityId = pickEntityId(body, response);

    if (path.endsWith('/scheduled-airline-pipeline/creation')) {
      const serial = String(
        (response as { serialNo?: string })?.serialNo ?? body.serialNo ?? '',
      ).trim();
      return {
        kind: 'creation_scheduled_airline',
        title: 'Scheduled airline saved',
        subtitle: serial
          ? `Creation · serial ${serial}${label !== 'New record' ? ` · ${label}` : ''}`
          : `Creation · ${label}`,
        actorName: actor,
        entityType: 'creation',
        entityId: serial || entityId,
      };
    }

    if (path.endsWith('/scheduled-airline-pipeline/creation-raf')) {
      const serial = String(
        (response as { serialNo?: string })?.serialNo ?? body.serialNo ?? '',
      ).trim();
      return {
        kind: 'creation_raf',
        title: 'RAF flight created',
        subtitle: serial
          ? `RAF · ${label} · serial ${serial}`
          : `RAF · ${label}`,
        actorName: actor,
        entityType: 'creation',
        entityId: entityId ?? serial,
      };
    }

    if (path.endsWith('/scheduled-airline-pipeline/creation-additional-flights/bulk')) {
      const savedCount = Number(
        (response as { savedCount?: number })?.savedCount ?? 0,
      );
      if (!savedCount) return null;
      return {
        kind: 'creation_additional_flight',
        title: 'Additional flights imported',
        subtitle: `${savedCount} flight${savedCount === 1 ? '' : 's'} added via CSV`,
        actorName: actor,
        entityType: 'creation',
      };
    }

    if (path.endsWith('/scheduled-airline-pipeline/creation-additional-flights')) {
      const serial = String(
        (response as { serialNo?: string })?.serialNo ?? body.serialNo ?? '',
      ).trim();
      return {
        kind: 'creation_additional_flight',
        title: 'Additional flight created',
        subtitle: serial
          ? `Additional · ${label} · serial ${serial}`
          : `Additional · ${label}`,
        actorName: actor,
        entityType: 'creation',
        entityId: entityId ?? serial,
      };
    }

    if (path.endsWith('/advance-airline') && method === 'POST') {
      return {
        kind: 'advance_airline',
        title: 'Advance airline added',
        subtitle: `${label}${body.code ? ` · ${String(body.code).trim()}` : ''}`,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (path.endsWith('/advance-aircraft') && method === 'POST') {
      return {
        kind: 'advance_aircraft',
        title: 'Advance aircraft added',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (path.endsWith('/advance-equipment') && method === 'POST') {
      return {
        kind: 'advance_equipment',
        title: 'Advance equipment added',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (path.endsWith('/advance-manpower') && method === 'POST') {
      return {
        kind: 'advance_manpower',
        title: 'Advance manpower added',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (path.endsWith('/advance-raf-airline') && method === 'POST') {
      return {
        kind: 'advance_raf_airline',
        title: 'Advance RAF airline added',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (path.endsWith('/advance-non-scheduled-airline') && method === 'POST') {
      return {
        kind: 'advance_ns_airline',
        title: 'Non-scheduled airline added',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (path.endsWith('/advance-terminal') && method === 'POST') {
      return {
        kind: 'advance_terminal',
        title: 'Advance terminal added',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (path.endsWith('/advance-gateway-scheduled-airline') && method === 'POST') {
      return {
        kind: 'advance_gateway_airline',
        title: 'Gateway scheduled airline added',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    if (
      path.includes('/equipment-manpower-details/admin/documents/') &&
      (method === 'PATCH' || method === 'PUT')
    ) {
      return {
        kind: 'advance_equipment_catalog',
        title: 'Equipment / manpower catalog updated',
        subtitle: label,
        actorName: actor,
        entityType: 'advance',
        entityId,
      };
    }

    return null;
  }
}
