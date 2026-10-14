import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedPrincipal | undefined,
    context: ExecutionContext,
  ) => {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedPrincipal;
    }>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
