import { SetMetadata } from '@nestjs/common';

export const SKIP_PROTECTION_KEY = 'protection:skip';

export const SkipProtection = () => SetMetadata(SKIP_PROTECTION_KEY, true);
