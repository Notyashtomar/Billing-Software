import { Injectable, Logger } from '@nestjs/common';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import type { FhrWindowCacheProvider } from './fhr-window-cache.provider';

/**
 * In-process implementation of {@link FhrWindowCacheProvider}.
 * Delegates to the private STA-window Map inside {@link FhrCollectionService}
 * via its public `invalidateStaWindowRowsCache` method and
 * `findAllLeanForDashboardBundle` as the cache-loading trigger.
 */
@Injectable()
export class InMemoryFhrWindowCacheProvider implements FhrWindowCacheProvider {
  private readonly logger = new Logger(InMemoryFhrWindowCacheProvider.name);

  constructor(private readonly fhrService: FhrCollectionService) {}

  async prewarm(dateStrings: string[]): Promise<void> {
    if (!dateStrings.length) return;
    this.logger.log(
      `[FhrWindowCache] prewarm dateCount=${dateStrings.length} sample=${dateStrings.slice(0, 3).join(',')}`,
    );
    try {
      // Calling findAllLeanForDashboardBundle will populate the internal
      // staWindowRowsCache for this key if it is not already cached.
      await this.fhrService.findAllLeanForDashboardBundle(dateStrings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[FhrWindowCache] prewarm_failed: ${msg}`);
    }
  }

  invalidate(dateStrings?: string[]): void {
    this.fhrService.invalidateStaWindowRowsCache(dateStrings);
  }
}
