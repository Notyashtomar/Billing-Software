import path from 'path';
import os from 'os';
import type { NextConfig } from 'next';

/** Minimal webpack config shape used by this file (avoid importing `webpack`). */
type WebpackConfig = {
  cache?: {
    type: 'filesystem';
    cacheDirectory: string;
    buildDependencies?: { config: string[] };
  };
  resolve?: {
    symlinks?: boolean;
    modules?: string[];
    alias?:
      | Record<string, string | false | string[]>
      | Array<
          | string
          | { name: string; alias: string | false | string[] }
          | [string, string | false | string[]]
        >;
    fallback?: Record<string, string | false>;
  };
};

/** LAN IPv4s for phones/tablets hitting `next dev` via http://192.168.x.x:3000 */
function resolveAllowedDevOrigins(): string[] {
  const origins = new Set<string>(['192.168.1.89']);

  for (const part of (process.env.ALLOWED_DEV_ORIGINS ?? '').split(',')) {
    const host = part.trim();
    if (host) origins.add(host);
  }

  for (const ifaces of Object.values(os.networkInterfaces())) {
    if (!Array.isArray(ifaces)) continue;
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        origins.add(iface.address);
      }
    }
  }

  return [...origins];
}

/**
 * Browser-only libs — stub on the server so OpenNext cannot re-bundle them.
 * Do NOT list these in `serverExternalPackages`: that marks them external and
 * OpenNext/esbuild then pulls the real node_modules into the Worker (see
 * exceljs/jspdf/xlsx NFT blowups past the 10 MiB gzip project limit).
 */
const BROWSER_ONLY_PACKAGES = [
  'exceljs',
  'jspdf',
  'html2canvas',
  'pdf-lib',
  'xlsx',
  // Manuals Word/PDF preview — must stay out of the OpenNext Worker graph
  // (mammoth+jszip alone blew past the 10 MiB gzip project limit).
  'mammoth',
  'word-extractor',
  'pdfjs-dist',
  'jszip',
  // Must precede bare `three`: webpack takes the first matching alias key, and
  // the bare-`three` alias points at a file, so a subpath request would
  // otherwise resolve to `<stub>.js/examples/...` (ENOTDIR).
  'three/examples/jsm/loaders/GLTFLoader.js',
  'three',
  'ogl',
  '3d-tiles-renderer',
  '3d-tiles-renderer/three',
  '3d-tiles-renderer/plugins',
  'face-api.js',
  'file-saver',
  'canvg',
  'postprocessing',
  'recharts',
  // Layout shells (FRIS/Billing/Admin) import framer-motion; stub on server so
  // OpenNext does not ship motion into the Worker (10 MiB gzip project limit).
  // `framer-motion` uses a dedicated no-op stub (not empty `{}`) so SSR of
  // client components that call `useReducedMotion()` does not throw.
  'framer-motion',
  'motion-dom',
  'motion-utils',
  // Subpaths before bare `gsap` (same ENOTDIR trap as three).
  'gsap/ScrollTrigger',
  'gsap/InertiaPlugin',
  'gsap',
  // Canvas/animation widgets — keep out of the OpenNext Worker (10 MiB gzip project limit).
  'react-image-crop/dist/ReactCrop.css',
  'react-image-crop',
  'react-signature-canvas',
  'react-countup',
] as const;

const emptyBrowserOnlyStub = path.join(__dirname, 'stubs', 'empty-browser-only.js');
const framerMotionServerStub = path.join(__dirname, 'stubs', 'framer-motion-server.js');

const BROWSER_ONLY_SERVER_ALIASES: Record<string, string> = Object.fromEntries(
  BROWSER_ONLY_PACKAGES.map((pkg) => [
    pkg,
    pkg === 'framer-motion' ? framerMotionServerStub : emptyBrowserOnlyStub,
  ]),
);

/**
 * Bind Cloudflare resources (D1: SAFETY_DB, AMS_DB, CHR_DB, HR_DB, ULD_DB, GEMM_DB, …)
 * into `next dev` via wrangler's platform proxy. All ops D1s use local
 * emulated SQLite under `.wrangler/state` — no remote bindings (remote D1
 * opens Cloudflare OAuth in the browser on every refresh).
 * Apply local schemas with `npm run d1:migrate:local` when available.
 *
 * Uses the generated bindings-only config: the proxy's workerd process would
 * otherwise hold `.open-next/assets` open and break a local OpenNext build.
 */
if (process.env.NODE_ENV === 'development') {
  void (async () => {
    const { writeWranglerDevConfig } = await import(
      '../../../scripts/wrangler-dev-config.mjs'
    );
    const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
    await initOpenNextCloudflareForDev({
      configPath: writeWranglerDevConfig(),
    } as Parameters<typeof initOpenNextCloudflareForDev>[0]);
  })().catch((err: unknown) => {
    console.warn(
      '[next.config] Cloudflare dev bindings unavailable — operational modules fall back to in-memory storage:',
      err instanceof Error ? err.message : err,
    );
  });
}

const nextConfig: NextConfig = {
  /**
   * Production deploy ships latest merged code from `main`.
   * Keep ignoreBuildErrors until the remaining ~50 pre-existing module TS errors
   * (GEMM/Manuals/HR/billing) are cleared; CI still runs `npm audit --audit-level=high`.
   * Do not weaken other gates.
   */
  /**
   * Browser PDF/Excel/3D libs are stubbed via webpack aliases above — never
   * externalize them or NFT will ship them into the Cloudflare Worker.
   * Prefer fetch for AI providers (no groq-sdk in the Worker graph).
   */
  /**
   * Allow phones/tablets on the LAN to load `/_next/*` dev assets when opening
   * the app via this machine's local IP (e.g. http://192.168.1.44:3000).
   * Auto-detects current IPv4; override with ALLOWED_DEV_ORIGINS=ip1,ip2.
   */
  allowedDevOrigins: resolveAllowedDevOrigins(),
  /**
   * `/api-backend/*` is handled by `app/api-backend/[[...path]]/route.ts` so
   * Set-Cookie headers from Railway are forwarded correctly to the browser.
   * Do NOT add a rewrite here — it bypasses the route and breaks auth cookies.
   */
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/api-backend/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },
  async rewrites() {
    // NEVER add `/api-backend/:path*` → Railway here. That bypasses
    // `app/api-backend/[[...path]]/route.ts` and breaks auth cookies on Cloudflare Workers.
    return [];
  },
  // Module trees are junctioned/symlinked into apps/web (ensure-module-mounts).
  outputFileTracingRoot: path.join(__dirname),
  /**
   * Pin Turbopack's workspace root to the web app. Without this, Next 16's
   * root inference can walk up to a parent lockfile and watch unrelated trees.
   */
  turbopack: {
    root: __dirname,
  },
  outputFileTracingExcludes: {
    '*': [
      'node_modules/next/dist/server/capsize-font-metrics.json',
      'node_modules/next/dist/compiled/next-devtools/**',
      'node_modules/next/dist/compiled/next-server/app-page-experimental.runtime.prod.js',
      'node_modules/next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js',
      'node_modules/next/dist/compiled/@next/font/dist/fontkit/**',
    ],
  },
  experimental: {
    // Optimize package imports so large libs tree-shake better in dev
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      // Do not list `framer-motion`: barrel-optimize + server stub alias made
      // `useReducedMotion` resolve as undefined on SSR ("is not a function").
      '@tanstack/react-query',
      'date-fns',
      'radix-ui',
    ],
    /**
     * Dev rewrites (`/api-backend/*` → Nest) default to a short proxy timeout.
     * `GET /scheduled-airline-pipeline/daily-from-advance` can take 90s+ and return ~1MB JSON.
     */
    proxyTimeout: 300_000,
    /**
     * Turbopack's persistent FS cache is enabled by default in Next 16.1 but
     * has an unbounded-growth bug: `.next/dev/cache/turbopack` bloats, gets
     * loaded into the Node heap, and after ~10-15 min the dev server stalls and
     * stops compiling (repeated multi-second "filesystem cache database
     * compaction" pauses are the tell). Disable it for dev to keep memory flat.
     * See vercel/next.js#81161 and #94915.
     */
    turbopackFileSystemCacheForDev: false,
  },
  webpack: (config, { isServer }) => {
    const webpackConfig = config as WebpackConfig;
    webpackConfig.resolve ??= {};
    // Junction mounts: realpath is under BWMS/modules/*. If webpack follows
    // symlinks, resolution hits modules/node_modules (API) before web deps
    // (e.g. lucide-react) and CI fails. Keep the apps/web mount path.
    webpackConfig.resolve.symlinks = false;
    // Prepend web deps — keep Next/webpack defaults so relative requires inside
    // `node_modules/next/dist/**` (e.g. ../../lib/picocolors) still resolve.
    const prevModules = webpackConfig.resolve.modules;
    const defaultModules = Array.isArray(prevModules)
      ? prevModules
      : prevModules
        ? [prevModules]
        : ['node_modules'];
    webpackConfig.resolve.modules = [
      path.join(__dirname, 'node_modules'),
      ...defaultModules,
    ];
    // Next 16.2.11 webpack builds no longer apply tsconfig `paths` (`@/*`)
    // unless `@` is set here. Clean `npm ci` / GitHub Actions then fail with
    // "Can't resolve '@/…'" for app imports. Pin `@` for client + server.
    const prev = webpackConfig.resolve.alias;
    const prevAsObject: Record<string, string | false | string[]> = Array.isArray(prev)
      ? Object.fromEntries(
          prev.map((entry) => {
            if (Array.isArray(entry)) return entry;
            if (typeof entry === 'object' && entry !== null && 'name' in entry) {
              return [entry.name, entry.alias] as const;
            }
            return [String(entry), String(entry)] as const;
          }),
        )
      : { ...(prev ?? {}) };

    webpackConfig.resolve.alias = {
      ...prevAsObject,
      '@': path.join(__dirname),
      ...(isServer ? BROWSER_ONLY_SERVER_ALIASES : {}),
      // Client: mammoth browser build (Node entry breaks Word preview in Next).
      // Must override the empty BROWSER_ONLY stub which only applies on server.
      ...(!isServer
        ? {
            mammoth: path.join(
              __dirname,
              'node_modules/mammoth/mammoth.browser.js',
            ),
          }
        : {}),
    };

    // face-api.js (GridScan / admin login) references Node builtins; stub for browser.
    if (!isServer) {
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback ?? {}),
        fs: false,
        path: false,
        crypto: false,
        encoding: false,
        stream: false,
        util: false,
      };
      // word-extractor / mammoth need the Buffer polyfill in the browser.
      const prevAlias = webpackConfig.resolve.alias;
      if (prevAlias && !Array.isArray(prevAlias)) {
        (prevAlias as Record<string, string | false | string[]>).buffer =
          path.join(__dirname, 'node_modules/buffer/');
      }
    }

    return config;
  },
};

export default nextConfig;
