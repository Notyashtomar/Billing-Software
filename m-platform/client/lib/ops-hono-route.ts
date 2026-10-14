import { resolveCloudflareBindings } from '@/lib/cloudflare-bindings';

type OpsFetchApp = {
  fetch: (request: Request, env?: any, ctx?: any) => Response | Promise<Response>;
};

type LazyOpsRouteOptions<TBindings extends Record<string, unknown>> = {
  moduleId: string;
  localBindings: () => TBindings;
  loadApp: () => Promise<OpsFetchApp>;
};

/**
 * Lazy-load operational Hono apps in App Router API routes so OpenNext keeps each
 * module in its own chunk instead of inflating the main Worker handler bundle.
 */
export function createLazyOpsRouteHandlers<TBindings extends Record<string, unknown>>(
  options: LazyOpsRouteOptions<TBindings>,
) {
  let appPromise: Promise<OpsFetchApp> | undefined;

  async function getApp(): Promise<OpsFetchApp> {
    if (process.env.NODE_ENV !== 'production') {
      return options.loadApp();
    }
    appPromise ??= options.loadApp();
    return appPromise;
  }

  async function handle(request: Request): Promise<Response> {
    const app = await getApp();
    const env = await resolveCloudflareBindings(options.localBindings(), {
      label: options.moduleId,
    });
    return app.fetch(request, env);
  }

  return {
    GET: handle,
    POST: handle,
    PATCH: handle,
    PUT: handle,
    DELETE: handle,
    OPTIONS: handle,
  };
}
