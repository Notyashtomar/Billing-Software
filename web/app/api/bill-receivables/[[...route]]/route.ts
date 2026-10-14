import { createLazyOpsRouteHandlers } from '@/lib/ops-hono-route';
import type { ReceivablesBindings } from '@/operational/m-bill-receivables/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } = createLazyOpsRouteHandlers({
  moduleId: 'bill-receivables',
  localBindings: () => ({}) as ReceivablesBindings,
  loadApp: async () => {
    const { createBillReceivablesApp } = await import(
      '@/operational/m-bill-receivables/server'
    );
    return createBillReceivablesApp();
  },
});
