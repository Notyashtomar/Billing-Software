import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  PROTECTION_ENV,
  type ProtectionEnv,
} from '../config/protection-env';
import { ConcurrencyLockService } from '../services/concurrency-lock.service';
import {
  getOrCreateRequestId,
  getPrincipalFromRequest,
  getRouteLabel,
} from '../utils/request-context.util';

@Injectable()
export class ImportConcurrencyInterceptor implements NestInterceptor {
  constructor(
    private readonly concurrency: ConcurrencyLockService,
    @Inject(PROTECTION_ENV) private readonly env: ProtectionEnv,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.env.enableImportConcurrencyControl) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const principal = getPrincipalFromRequest(req);
    const holderId = principal?.userid ?? 'anonymous';
    const route = getRouteLabel(req);
    const requestId = getOrCreateRequestId(req);

    this.concurrency.tryAcquire('bulk-import', holderId, {
      enabled: true,
      maxConcurrent: this.env.maxImportConcurrent,
      mode: this.env.throttleMode,
      route,
      requestId,
    });

    return next.handle().pipe(
      finalize(() => {
        this.concurrency.release('bulk-import', holderId);
      }),
    );
  }
}
