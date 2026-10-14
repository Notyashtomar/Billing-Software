import 'client-only';

import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { TilesRenderer } from '3d-tiles-renderer/three';
import type { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';

/** Required on dark backgrounds per Google Maps Platform attribution guidelines. */
export const GOOGLE_MAPS_ATTRIBUTION_LOGO =
  'https://www.gstatic.com/mapsplatform/maps_api/google_logo_white.svg';

export function getGoogleMapsApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || undefined;
}

export type GooglePhotorealisticGlobe = {
  tilesRenderer: TilesRenderer;
  authPlugin: GoogleCloudAuthPlugin;
  group: import('three').Group;
  update: () => void;
  setResolutionFromRenderer: () => void;
  scaleToSceneRadius: (radius: number) => void;
  dispose: () => void;
};

export async function createGooglePhotorealisticGlobe(
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
  options?: {
    onTilesetLoaded?: () => void;
    onError?: (error: unknown) => void;
  },
): Promise<GooglePhotorealisticGlobe | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  try {
    const [THREE, { TilesRenderer }, { GoogleCloudAuthPlugin }] = await Promise.all([
      import('three'),
      import('3d-tiles-renderer/three'),
      import('3d-tiles-renderer/plugins'),
    ]);

    const tilesRenderer = new TilesRenderer();
    const authPlugin = new GoogleCloudAuthPlugin({
      apiToken: apiKey,
      useRecommendedSettings: true,
      logoUrl: GOOGLE_MAPS_ATTRIBUTION_LOGO,
      autoRefreshToken: true,
    });

    tilesRenderer.registerPlugin(authPlugin);
    tilesRenderer.setCamera(camera);
    tilesRenderer.setResolutionFromRenderer(camera, renderer);

    const scaleToSceneRadius = (radius: number) => {
      const sphere = new THREE.Sphere();
      if (!tilesRenderer.getBoundingSphere(sphere)) return;

      const scale = radius / sphere.radius;
      tilesRenderer.group.scale.setScalar(scale);
      tilesRenderer.group.position.copy(sphere.center).multiplyScalar(-scale);
    };

    const onTilesetLoaded = () => {
      options?.onTilesetLoaded?.();
    };

    const onTilesetError = (event: { error?: unknown }) => {
      options?.onError?.(event.error ?? event);
    };

    tilesRenderer.addEventListener('load-tileset', onTilesetLoaded);
    tilesRenderer.addEventListener('load-tileset-error', onTilesetError);

    return {
      tilesRenderer,
      authPlugin,
      group: tilesRenderer.group,
      scaleToSceneRadius,
      update: () => {
        camera.updateMatrixWorld();
        tilesRenderer.setResolutionFromRenderer(camera, renderer);
        tilesRenderer.update();
      },
      setResolutionFromRenderer: () => {
        tilesRenderer.setResolutionFromRenderer(camera, renderer);
      },
      dispose: () => {
        tilesRenderer.removeEventListener('load-tileset', onTilesetLoaded);
        tilesRenderer.removeEventListener('load-tileset-error', onTilesetError);
        tilesRenderer.dispose();
      },
    };
  } catch (error) {
    options?.onError?.(error);
    return null;
  }
}

export function readGoogleAttributionText(
  authPlugin: GoogleCloudAuthPlugin,
): string {
  const attributions: Array<{ value?: string; type?: string }> = [];
  if (typeof (authPlugin as unknown as Record<string, unknown>).getAttributions === 'function') {
    (authPlugin as unknown as { getAttributions: (target: unknown[]) => void }).getAttributions(attributions);
  }
  return attributions
    .filter((item) => item.type === 'string' && item.value)
    .map((item) => item.value)
    .join(' ');
}
