import { createLazyOpsRouteHandlers } from '@/lib/ops-hono-route';
import { opsModuleLocalEnvBindings } from '@/lib/ops-module-session';
import type { AmsBindings } from '@/operational/m-ams/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } = createLazyOpsRouteHandlers({
  moduleId: 'ams',
  localBindings: () => opsModuleLocalEnvBindings() as AmsBindings,
  loadApp: async () => {
    const { createAmsApp } = await import('@/operational/m-ams/server');
    return createAmsApp();
  },
});
