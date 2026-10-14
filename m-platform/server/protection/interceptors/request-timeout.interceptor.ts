import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SKIP_TIMEOUT_KEY } from '../decorators/skip-timeout.decorator';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import {
  PROTECTION_ENV,
  type ProtectionEnv,
} from '../config/protection-env';
import { ProtectionLogEvent } from '../logging/protection-log-events';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import {
  ensureRequestAbortController,
  getOrCreateRequestId,
  getPrincipalFromRequest,
  getRouteLabel,
} from '../utils/request-context.util';

@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly protectionLogger: ProtectionLoggerService,
    private readonly reflector: Reflector,
    @Inject(PROTECTION_ENV) private readonly env: ProtectionEnv,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    // Always attach abort signal so services can honor client disconnect even
    // when ENABLE_REQUEST_TIMEOUTS is false.
    const abortController = ensureRequestAbortController(req);

    if (!this.env.enableRequestTimeouts) {
      return next.handle();
    }

    const skipTimeout = this.reflector.getAllAndOverride<boolean>(
      SKIP_TIMEOUT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipTimeout) {
      return next.handle();
    }

    const route = getRouteLabel(req);
    const startedAt = Date.now();
    const timeoutMs = this.env.requestTimeoutMs;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          if (!abortController.signal.aborted) {
            abortController.abort('request timeout');
          }
          const principal = getPrincipalFromRequest(req);
          this.protectionLogger.logEvent(ProtectionLogEvent.TIMEOUT, {
            route,
            duration: `${Date.now() - startedAt}ms`,
            userId: principal?.userid,
            requestId: getOrCreateRequestId(req),
            configuredTimeoutMs: timeoutMs,
          });
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
