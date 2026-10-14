import { SetMetadata } from '@nestjs/common';

export const THROTTLE_CATEGORY_KEY = 'protection:throttleCategory';

export type ThrottleCategory = 'AUTH' | 'REPORTS' | 'EXPORT' | 'GLOBAL';

export const ThrottleCategoryDecorator = (category: ThrottleCategory) =>
  SetMetadata(THROTTLE_CATEGORY_KEY, category);
