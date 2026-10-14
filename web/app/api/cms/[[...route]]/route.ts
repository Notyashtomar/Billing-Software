import { createLazyOpsRouteHandlers } from '@/lib/ops-hono-route';
import { opsModuleLocalEnvBindings } from '@/lib/ops-module-session';
import type { CmsBindings } from '@/operational/m-cms/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } =
  createLazyOpsRouteHandlers({
    moduleId: 'cms',
    localBindings: () => opsModuleLocalEnvBindings() as CmsBindings,
    loadApp: async () => {
      const { createCmsApp } = await import('@/operational/m-cms/server');
      return createCmsApp();
    },
  });
