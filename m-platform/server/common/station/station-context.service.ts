import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import {
  buildStationScope,
  StationScope,
  type StationScopeContext,
} from './station-scope';

/**
 * Request-scoped accessor for the current station context.
 *
 * Inject this in services that prefer dependency injection over forwarding a
 * {@link StationScopeContext} from the controller. Functionally equivalent to
 * the `@CurrentStation()` parameter decorator.
 */
@Injectable({ scope: Scope.REQUEST })
export class StationContextService {
  constructor(
    @Inject(REQUEST)
    private readonly request: Request & { user?: AuthenticatedPrincipal },
  ) {}

  /** Resolved scope (station code + cross-station admin flag) for this request. */
  get scope(): StationScopeContext {
    return buildStationScope(this.request.user);
  }

  /** The active clean station code, or undefined for cross-station admins. */
  get stationCode(): string | undefined {
    return this.scope.stationCode;
  }

  /** True when the principal is an admin operating across all stations. */
  get isCrossStation(): boolean {
    return this.scope.crossStation;
  }

  /** Throws when no station is associated with the session. */
  requireStationCode(): string {
    return StationScope.require(this.scope);
  }
}
