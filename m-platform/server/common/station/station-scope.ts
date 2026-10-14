import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import {
  STATION_CODE_FIELD,
  TESTING_STATION_CODE,
  isTestingStationCode,
  normalizeStationCode,
} from './station.constants';

/**
 * Build the read predicate for a single station code.
 *
 * Every station (including MAA/Chennai) matches **only** documents stamped with
 * that exact `stationCode`. Unscoped / empty `stationCode` rows are never
 * treated as belonging to any station — they must be backfilled explicitly.
 */
function stationPredicate(
  code: string,
  field: string,
): Record<string, unknown> {
  return { [field]: code };
}

/**
 * The resolved station scope for a request.
 *
 * - `crossStation: true` means the principal (an admin) operates across all
 *   stations; no station filter is applied and creates are not auto-stamped.
 * - Otherwise `stationCode` is the single station the request is confined to.
 */
export interface StationScopeContext {
  stationCode?: string;
  crossStation: boolean;
}

/**
 * Scope for internal system/cross-phase callers that legitimately operate
 * without a single station filter (e.g. admin flight-cancellation sync, and
 * report/dashboard builders not yet converted in their own phase). Behaves like
 * an admin: reads are unfiltered (current behaviour preserved). Replace with a
 * real per-request scope as each consuming module is converted.
 */
export const CROSS_STATION_SYSTEM_SCOPE: StationScopeContext = {
  crossStation: true,
};

/** Build a fixed single-station scope (used by station-specific importers). */
export function fixedStationScope(stationCode: string): StationScopeContext {
  return {
    crossStation: false,
    stationCode: normalizeStationCode(stationCode),
  };
}

/**
 * Advance → Gateway list/read scope.
 * The testing station is not an airport: its own creates stay on `TEST`, but
 * gateway lists include every station so testers can see live gateway masters.
 * Writes keep the caller's real scope so other stations are not mutated.
 */
export function scopeForGatewayRead(
  ctx: StationScopeContext,
): StationScopeContext {
  if (isTestingStationCode(ctx.stationCode)) {
    return {
      crossStation: true,
      stationCode: TESTING_STATION_CODE,
    };
  }
  return ctx;
}

/**
 * Build a {@link StationScopeContext} from an authenticated principal.
 *
 * Visibility is determined by the active station, NOT by role. Every principal —
 * users AND admins (including `role === 'superadmin'`) — is confined to the
 * station their session is currently bound to. A Global Admin
 * (`isGlobalAdmin === true`) may sign in to ANY station, but once a station is
 * active their view is confined to that station exactly like a regular user:
 * one station's data is never visible while operating inside another.
 *
 * The only unfiltered, system-wide scope is a Global Admin with NO active
 * station (e.g. an admin-panel session that carries no FRIS station context).
 * That keeps genuine cross-station administration working without leaking one
 * station's operational data into another station's view.
 *
 * Fail-closed: a non-global principal with no station receives
 * `{ crossStation: false, stationCode: undefined }` — never global access. The
 * missing station then rejects at data-access time via `StationScope.require()`.
 */
export function buildStationScope(
  principal:
    | Pick<
        AuthenticatedPrincipal,
        'accountType' | 'stationCode' | 'isGlobalAdmin'
      >
    | null
    | undefined,
): StationScopeContext {
  if (!principal) {
    return { crossStation: false };
  }
  if (principal.accountType === 'admin' && principal.isGlobalAdmin === true) {
    const code = normalizeStationCode(principal.stationCode);
    // Global admin with an active station -> confined to that station, so no
    // other station's data leaks into the current view. Global admin without a
    // station (admin-panel/system context) -> retains unfiltered access.
    if (code) {
      return { crossStation: false, stationCode: code };
    }
    return { crossStation: true };
  }
  return {
    crossStation: false,
    stationCode: normalizeStationCode(principal.stationCode),
  };
}

/**
 * Reusable, enterprise-grade station scoping primitives.
 *
 * Services use these instead of hand-writing `{ stationCode }` filters so the
 * segregation rules stay consistent everywhere:
 *  - `filter()`  on every read
 *  - `stampCreate()` on every create
 *  - `assertOwnership()` on every update/delete
 */
export const StationScope = {
  /**
   * Returns the active station code, throwing when a station-scoped operation
   * is attempted without one (e.g. a misconfigured FRIS session).
   */
  require(ctx: StationScopeContext): string {
    const code = normalizeStationCode(ctx.stationCode);
    if (!code) {
      throw new ForbiddenException(
        'No station is associated with this session. Please sign in again with a station selected.',
      );
    }
    return code;
  },

  /**
   * Merge a station predicate into a Mongoose filter. Cross-station admins are
   * returned the filter unchanged (optionally narrowed if they explicitly pass
   * a station). The injected `stationCode` always wins over any client value.
   */
  filter<T extends Record<string, unknown>>(
    base: T,
    ctx: StationScopeContext,
    field: string = STATION_CODE_FIELD,
  ): T & Record<string, unknown> {
    if (ctx.crossStation) {
      // Admin: do not constrain unless they purposely scoped to one station.
      return base;
    }
    const code = this.require(ctx);
    const predicate = stationPredicate(code, field);
    if (Object.keys(base).length === 0) {
      return predicate as T & Record<string, unknown>;
    }
    return { ...base, [field]: code };
  },

  /**
   * Stamp the derived station code onto a create payload, stripping any
   * client-supplied value. Cross-station admins must supply an explicit code.
   */
  stampCreate<T extends Record<string, unknown>>(
    data: T,
    ctx: StationScopeContext,
    field: string = STATION_CODE_FIELD,
  ): T & Record<string, string> {
    const { [field]: _ignoredClientValue, ...rest } = data as Record<
      string,
      unknown
    >;

    if (ctx.crossStation) {
      const code = normalizeStationCode(ctx.stationCode);
      if (!code) {
        throw new InternalServerErrorException(
          'A station code is required to create this record.',
        );
      }
      return { ...(rest as T), [field]: code };
    }

    const code = this.require(ctx);
    return { ...(rest as T), [field]: code };
  },

  /**
   * Reject cross-station reads/updates/deletes. Call after loading a document
   * by id to ensure it belongs to the caller's station before mutating it.
   */
  assertOwnership(
    doc: { [key: string]: unknown } | null | undefined,
    ctx: StationScopeContext,
    field: string = STATION_CODE_FIELD,
  ): void {
    if (!doc) return;
    if (ctx.crossStation) return;
    const code = this.require(ctx);
    const docCode = normalizeStationCode(doc[field] as string | undefined);
    if (!docCode || docCode !== code) {
      throw new ForbiddenException(
        'This record belongs to a different station.',
      );
    }
  },
} as const;
