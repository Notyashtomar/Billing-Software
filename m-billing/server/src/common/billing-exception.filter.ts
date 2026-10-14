import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { BillingForbiddenError } from './billing-forbidden.error';

@Catch(BillingForbiddenError)
export class BillingForbiddenErrorFilter implements ExceptionFilter {
  catch(exception: BillingForbiddenError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();
    response.status(HttpStatus.FORBIDDEN).json({
      statusCode: HttpStatus.FORBIDDEN,
      message: exception.message,
      error: 'Forbidden',
    });
  }
}
