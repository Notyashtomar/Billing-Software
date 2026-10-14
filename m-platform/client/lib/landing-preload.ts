import 'client-only';

/** Local textures only — do not warm CDN 4K maps (fills disk + GPU decode). */
const EARTH_TEXTURE_URLS = [
  '/textures/earth-day.jpg',
  '/textures/earth-topology.jpg',
] as const;

let preloadStarted = false;

/** Warm landing textures before the globe mounts (EarthScene loads via page-level dynamic import). */
export function preloadLandingScene(): void {
  if (typeof window === 'undefined' || preloadStarted) return;
  preloadStarted = true;

  for (const src of EARTH_TEXTURE_URLS) {
    const img = new Image();
    img.src = src;
  }
}
