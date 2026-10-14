import { SetMetadata } from '@nestjs/common';

export const SKIP_TIMEOUT_KEY = 'protection:skipTimeout';

/** Excludes a handler from the global request timeout interceptor when timeouts are enabled. */
export const SkipTimeout = () => SetMetadata(SKIP_TIMEOUT_KEY, true);
