import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { MulterError } from 'multer';
import {
  PROTECTION_ENV,
  type ProtectionEnv,
} from '../config/protection-env';
import { ProtectionLogEvent } from '../logging/protection-log-events';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import {
  getOrCreateRequestId,
  getPrincipalFromRequest,
  getRouteLabel,
} from '../utils/request-context.util';

@Catch(MulterError)
export class MulterLimitLoggingFilter implements ExceptionFilter {
  constructor(
    private readonly protectionLogger: ProtectionLoggerService,
    @Inject(PROTECTION_ENV) private readonly env: ProtectionEnv,
  ) {}

  catch(exception: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<{ status: (n: number) => { json: (b: unknown) => void } }>();

    if (this.env.enableSecurityLogging && exception.code === 'LIMIT_FILE_SIZE') {
      const principal = getPrincipalFromRequest(req);
      this.protectionLogger.logEvent(ProtectionLogEvent.REQUEST_REJECTED, {
        reason: 'file-size-limit',
        route: getRouteLabel(req),
        userId: principal?.userid,
        requestId: getOrCreateRequestId(req),
        multerCode: exception.code,
      });
    }

    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: exception.message,
    });
  }
}
