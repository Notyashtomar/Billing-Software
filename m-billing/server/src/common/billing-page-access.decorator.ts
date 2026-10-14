import { applyDecorators } from '@nestjs/common';
import { FrisPagePermission } from 'src/auth/decorators/fris-page-permission.decorator';

/** Reuses Advance → Invoicing permission until a dedicated billing tab is assigned. */
export function BillingPageAccess() {
  return applyDecorators(FrisPagePermission('advance', 'Invoicing'));
}
