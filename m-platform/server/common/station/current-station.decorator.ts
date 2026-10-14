import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { buildStationScope, type StationScopeContext } from './station-scope';

/**
 * Resolve the request's {@link StationScopeContext} from the authenticated
 * principal. Inject into controllers and forward to services so station
 * scoping is derived from the session, never from the client payload.
 *
 * @example
 * findAll(@CurrentStation() station: StationScopeContext) {
 *   return this.service.findAll(station);
 * }
 */
export const CurrentStation = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StationScopeContext => {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedPrincipal;
    }>();
    return buildStationScope(request.user);
  },
);
