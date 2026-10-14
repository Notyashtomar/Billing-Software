import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { billingPersonalWorkspace } from './billing-personal-workspace';

type RequestUser = { userId?: string; id?: string };

/**
 * Binds the signed-in user for preparation ownership checks.
 * Master data and saved invoices are not filtered by this scope.
 */
@Injectable()
export class BillingPersonalWorkspaceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const userId = String(request.user?.userId ?? request.user?.id ?? '').trim();
    if (!userId) return next.handle();
    return new Observable((subscriber) => {
      const subscription = billingPersonalWorkspace.run(userId, () =>
        next.handle().subscribe(subscriber),
      );
      return () => subscription.unsubscribe();
    });
  }
}
