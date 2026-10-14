'use client';

import 'client-only';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './EarthScene.css';

type GeoFeatureCollection = {
  features: Array<{
    properties?: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
};
import { INDIA_AIRPORTS } from '@/data/india-airports';
import { buildLoginStationUrl } from '@/lib/login-station-constants';
import {
  appendLoginReturnNext,
  persistLoginStationSelection,
} from '@/lib/login-station-client';

/** Local textures only — avoid CDN 4K/2K maps that bloat browser disk cache. */
const EARTH_DAY_TEXTURE_URLS = ['/textures/earth-day.jpg'] as const;

/** Optional; empty = skip (bump map / flat shading fallback). */
const EARTH_NORMAL_TEXTURE_URLS = [] as const;

/** Ocean specular — optional without CDN. */
const EARTH_SPECULAR_TEXTURE_URLS = [] as const;

const EARTH_CLOUDS_TEXTURE_URLS = [] as const;

async function loadTextureFirstAvailable(
  loader: THREE.TextureLoader,
  urls: readonly string[],
): Promise<THREE.Texture> {
  if (urls.length === 0) {
    throw new Error('No texture URLs configured');
  }
  let last: unknown;
  for (const url of urls) {
    try {
      return await loader.loadAsync(url);
    } catch (e) {
      last = e;
      console.warn(`[EarthScene] texture failed: ${url}`, e);
    }
  }
  throw last instanceof Error ? last : new Error('All earth textures failed to load');
}

/** Visible stand-in if the day map cannot decode (never pure black). */
function createEarthFallbackMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: 0x1b4f72,
    emissive: new THREE.Color(0x0a1f33),
    emissiveIntensity: 0.35,
    specular: new THREE.Color(0x2a3d55),
    shininess: 18,
  });
}

function configureEarthSurfaceTexture(
  texture: THREE.Texture,
  renderer: THREE.WebGLRenderer,
): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(
    16,
    renderer.capabilities.getMaxAnisotropy(),
  );
}

function configureEarthNormalTexture(
  texture: THREE.Texture,
  renderer: THREE.WebGLRenderer,
): void {
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(
    16,
    renderer.capabilities.getMaxAnisotropy(),
  );
}

function configureSpecularTexture(
  texture: THREE.Texture,
  renderer: THREE.WebGLRenderer,
): void {
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(
    16,
    renderer.capabilities.getMaxAnisotropy(),
  );
}

/** Low-frequency hash for procedural space dust (deterministic). */
function spaceHash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Equirectangular RGBA background: deep blue-black void, subtle galactic band,
 * faint nebula noise — reads closer to real deep space than flat #000.
 */
function createDeepSpaceEquirectTexture(
  width = 1024,
  height = 512,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const gx = 0.12;
  const gy = 0.84;
  const gz = 0.32;
  const glen = Math.hypot(gx, gy, gz);
  const igx = gx / glen;
  const igy = gy / glen;
  const igz = gz / glen;

  let p = 0;
  for (let j = 0; j < height; j++) {
    const v = (j + 0.5) / height;
    const theta = v * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let i = 0; i < width; i++) {
      const u = (i + 0.5) / width;
      const phi = u * Math.PI * 2;
      const dirX = sinT * Math.cos(phi);
      const dirY = cosT;
      const dirZ = sinT * Math.sin(phi);

      const galDot = Math.abs(dirX * igx + dirY * igy + dirZ * igz);
      const milky = Math.pow(Math.max(0, galDot - 0.42), 2.4) * 6.5;

      const n1 = spaceHash(i * 0.07 + j * 0.11);
      const n2 = spaceHash(i * 0.13 - j * 0.09 + 4.1);
      const dust = (n1 * 0.55 + n2 * 0.45) * 0.22;

      const nebR = 6 + milky * 38 + dust * 28;
      const nebG = 10 + milky * 32 + dust * 22;
      const nebB = 22 + milky * 48 + dust * 35;

      data[p++] = Math.min(255, Math.floor(nebR));
      data[p++] = Math.min(255, Math.floor(nebG));
      data[p++] = Math.min(255, Math.floor(nebB));
      data[p++] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, width, height);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const CONFIG = {
  R: 10,
  INDIA_LAT: 22.0,
  INDIA_LON: 79.0,
  /** Local height/bump fallback if the CDN normal map cannot load. */
  BUMP_URL: '/textures/earth-topology.jpg',
  /** Warm brown so boundaries read with satellite land tones, not ink on top. */
  INDIA_BORDER_COLOR: 0x3a3128,
  /** Alpha for blending with the day texture (0–1). */
  INDIA_BORDER_OPACITY: 0.5,
  DOT_COLOR: 0xffffff, // White color for dots
  DOT_HOVER_COLOR: 0x10b981, // Emerald-500 color (hex: #10b981)
  DOT_SIZE: 0.03,
  DOT_SEGMENTS: 32,
  RING_INNER: 0.08,
  RING_OUTER: 0.10,
  RING_SEGMENTS: 32,
  CLICK_ZONE_RADIUS: 0.3,
  DOT_RAISE: 0.08,
  GLOW_INTENSITY: 0.8,
  BREATHING_SPEED: 0.008,
  MAX_BREATHING_SCALE: 1.4,
  /** Single discrete jump while hovered; then rest before the next (no continuous pulse). */
  STATION_JUMP_DURATION_MS: 360,
  STATION_JUMP_REST_MS: 500,
  STATION_JUMP_SCALE_AMP: 0.1,
  STATION_LABEL_TY_PX: 6,
  STATION_LABEL_SCALE_AMP: 0.08,
  /** Full camera dolly into India (ms); globe stays fixed (no spin). */
  CAMERA_FLY_DURATION_MS: 3600,
  /**
   * How far out we start along the India-facing ray (multiple of final camera distance).
   * Larger = more “from space”; too large makes the planet a tiny speck.
   */
  CAMERA_START_DISTANCE_MULTIPLIER: 22,
  /** Camera distance along India-facing ray after fly-in (world units); larger = more zoomed out. */
  CAMERA_FINAL_DISTANCE: 18.5,
  /** Airport hover card width (20% smaller than original 300×320). */
  AIRPORT_CARD_MIN_W: 240,
  AIRPORT_CARD_MAX_W: 256,
  /** Approx. total card height for viewport clamping (image + text + padding). */
  AIRPORT_CARD_EST_HEIGHT: 248,
  /** Fixed seed for reproducible star positions (world space, not per-frame). */
  STARFIELD_SEED: 0x4b1d4e11,
  /**
   * Inner / outer radii for star shells (world units). Camera starts ~22× final distance (~350)
   * from origin; large outer radii keep the sky densely starred on frame 1.
   */
  STAR_BASE_SIZE: 0.54,
  /** Base angular drift for star shells (rad/s); outer shells use higher multipliers. */
  STARFIELD_YAW_RAD_PER_SEC: 0.011,
  /** Whole starfield slow roll about Z for extra depth (fraction of yaw). */
  STARFIELD_ROLL_FRAC: 0.14,
  STAR_SHELLS: [
    { r0: 95, r1: 160, count: 1400, sizeMul: 1.08 },
    { r0: 180, r1: 300, count: 1700, sizeMul: 1.14 },
    { r0: 340, r1: 560, count: 1800, sizeMul: 1.02 },
  ] as const,
};

/**
 * Places the airport card so it stays fully on-screen: flips left/up near edges,
 * then clamps to viewport with padding.
 */
function getAirportCardScreenPosition(
  clientX: number,
  clientY: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  const pad = 10;
  const gap = 12;
  const w = Math.min(CONFIG.AIRPORT_CARD_MAX_W, viewportW - pad * 2);
  const h = Math.min(CONFIG.AIRPORT_CARD_EST_HEIGHT, viewportH - pad * 2);

  let x = clientX + gap;
  let y = clientY + gap;

  if (x + w > viewportW - pad) {
    x = clientX - w - gap;
  }
  x = Math.max(pad, Math.min(x, viewportW - w - pad));

  if (y + h > viewportH - pad) {
    y = clientY - h - gap;
  }
  y = Math.max(pad, Math.min(y, viewportH - h - pad));

  return { x, y };
}

type StationLabelAnchor = 'above' | 'left' | 'right';

/** Tailwind `md` — phones only; tablet (768px+) and desktop keep the original globe. */
const MOBILE_GLOBE_MAX_WIDTH = 767;

function isMobileGlobeViewport(width: number): boolean {
  return width <= MOBILE_GLOBE_MAX_WIDTH;
}

const DESKTOP_LEFT_SIDE_STATION_CITIES = new Set([
  'delhi',
  'coimbatore',
  'kochi',
  'trivandrum',
  'trivandarum',
]);

const DESKTOP_RIGHT_SIDE_STATION_CITIES = new Set([
  'chennai',
  'chnnai',
  'trichy',
  'noida',
  'agra',
]);

const MOBILE_LEFT_SIDE_STATION_CITIES = new Set([
  ...DESKTOP_LEFT_SIDE_STATION_CITIES,
  'chandigarh',
  'imphal',
  'agartala',
  'goa',
  'juhu',
]);

const MOBILE_RIGHT_SIDE_STATION_CITIES = new Set([
  ...DESKTOP_RIGHT_SIDE_STATION_CITIES,
  'bengaluru',
  'hyderabad',
]);

type LabelLayoutConfig = {
  labelPad: number;
  labelEstW: number;
  labelEstH: number;
  labelGap: number;
  dotPad: number;
};

type IndiaFramingConfig = LabelLayoutConfig & {
  indiaLat: number;
  indiaLon: number;
  cameraDistance: number;
};

function getStationLabelAnchorForCity(
  city: string,
  mobile: boolean,
): StationLabelAnchor {
  const key = String(city).toLowerCase();
  const leftSet = mobile
    ? MOBILE_LEFT_SIDE_STATION_CITIES
    : DESKTOP_LEFT_SIDE_STATION_CITIES;
  const rightSet = mobile
    ? MOBILE_RIGHT_SIDE_STATION_CITIES
    : DESKTOP_RIGHT_SIDE_STATION_CITIES;
  if (leftSet.has(key) || key === 'coimbatore') {
    return 'left';
  }
  if (rightSet.has(key)) {
    return 'right';
  }
  return 'above';
}

function getStationLabelAnchor(el: HTMLElement): StationLabelAnchor {
  if (
    el.classList.contains('earth-station-tag--left') ||
    el.classList.contains('earth-station-tag--coimbatore')
  ) {
    return 'left';
  }
  if (el.classList.contains('earth-station-tag--right')) {
    return 'right';
  }
  return 'above';
}

/** Keeps screen-space station tags fully inside the viewport on narrow portrait screens. */
function clampStationLabelScreenPosition(
  anchorX: number,
  anchorY: number,
  anchor: StationLabelAnchor,
  labelW: number,
  labelH: number,
  gap: number,
  viewportW: number,
  viewportH: number,
  pad: number,
): { x: number; y: number } {
  let x = anchorX;
  let y = anchorY;

  if (anchor === 'above') {
    let left = x - labelW / 2;
    let right = x + labelW / 2;
    let top = y - labelH - gap;
    if (left < pad) x += pad - left;
    if (right > viewportW - pad) x -= right - (viewportW - pad);
    left = x - labelW / 2;
    right = x + labelW / 2;
    top = y - labelH - gap;
    if (top < pad) y = pad + labelH + gap;
    if (y > viewportH - pad) y = viewportH - pad;
    if (left < pad) x = pad + labelW / 2;
    if (right > viewportW - pad) x = viewportW - pad - labelW / 2;
  } else if (anchor === 'left') {
    let left = x - labelW - gap;
    let top = y - labelH / 2;
    let bottom = y + labelH / 2;
    if (left < pad) x = pad + labelW + gap;
    if (top < pad) y = pad + labelH / 2;
    if (bottom > viewportH - pad) y = viewportH - pad - labelH / 2;
    if (x > viewportW - pad) x = viewportW - pad;
  } else {
    let right = x + gap + labelW;
    let top = y - labelH / 2;
    let bottom = y + labelH / 2;
    if (right > viewportW - pad) x = viewportW - pad - labelW - gap;
    if (top < pad) y = pad + labelH / 2;
    if (bottom > viewportH - pad) y = viewportH - pad - labelH / 2;
    if (x < pad) x = pad;
  }

  return { x, y };
}

/** Geographic center of all landing stations — keeps India centered in frame. */
function computeIndiaFocusPoint(): { lat: number; lon: number } {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const airport of INDIA_AIRPORTS) {
    const lat = airport.plotLat ?? airport.lat;
    const lon = airport.plotLon ?? airport.lon;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
  };
}

/** Extra surface points around the station bbox so state borders stay in frame. */
function getIndiaMapProbePoints(): Array<{ lat: number; lon: number }> {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const airport of INDIA_AIRPORTS) {
    const lat = airport.plotLat ?? airport.lat;
    const lon = airport.plotLon ?? airport.lon;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  const padLat = 1.6;
  const padLon = 2.0;
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;

  return [
    { lat: maxLat + padLat, lon: midLon },
    { lat: minLat - padLat, lon: midLon },
    { lat: midLat, lon: minLon - padLon },
    { lat: midLat, lon: maxLon + padLon },
  ];
}

function mapProbeScreenFits(
  localPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  earthGroup: THREE.Group,
  viewportW: number,
  viewportH: number,
  pad: number,
  scratch: {
    wp: THREE.Vector3;
    normal: THREE.Vector3;
    toCam: THREE.Vector3;
  },
): boolean {
  const { wp, normal, toCam } = scratch;
  wp.copy(localPos).applyMatrix4(earthGroup.matrixWorld);
  normal.copy(wp).normalize();
  toCam.copy(camera.position).sub(wp).normalize();
  if (normal.dot(toCam) <= 0) return false;

  wp.project(camera);
  const x = (wp.x * 0.5 + 0.5) * viewportW;
  const y = (-wp.y * 0.5 + 0.5) * viewportH;

  return x >= pad && x <= viewportW - pad && y >= pad && y <= viewportH - pad;
}

function getLabelLayoutConfig(width: number, height: number): LabelLayoutConfig {
  const aspect = width / Math.max(height, 1);
  const isNarrowPortrait = aspect < 0.72;
  const isPortrait = aspect < 1;
  const minDim = Math.min(width, height);

  return {
    labelPad: isNarrowPortrait
      ? Math.max(8, Math.round(minDim * 0.032))
      : isPortrait
        ? 10
        : 12,
    labelEstW: isNarrowPortrait ? 50 : isPortrait ? 56 : 68,
    labelEstH: isNarrowPortrait ? 20 : isPortrait ? 22 : 26,
    labelGap: isNarrowPortrait ? 6 : isPortrait ? 8 : 14,
    dotPad: isNarrowPortrait
      ? Math.max(10, Math.round(minDim * 0.038))
      : isPortrait
        ? 12
        : 14,
  };
}

function stationScreenFits(
  localPos: THREE.Vector3,
  city: string,
  camera: THREE.PerspectiveCamera,
  earthGroup: THREE.Group,
  viewportW: number,
  viewportH: number,
  labelCfg: LabelLayoutConfig,
  scratch: {
    wp: THREE.Vector3;
    normal: THREE.Vector3;
    toCam: THREE.Vector3;
  },
): boolean {
  const { wp, normal, toCam } = scratch;
  wp.copy(localPos).applyMatrix4(earthGroup.matrixWorld);
  normal.copy(wp).normalize();
  toCam.copy(camera.position).sub(wp).normalize();
  if (normal.dot(toCam) <= 0) return false;

  wp.project(camera);
  const projectedX = (wp.x * 0.5 + 0.5) * viewportW;
  const projectedY = (-wp.y * 0.5 + 0.5) * viewportH;

  const anchor = getStationLabelAnchorForCity(city, true);
  const { x, y } = clampStationLabelScreenPosition(
    projectedX,
    projectedY,
    anchor,
    labelCfg.labelEstW,
    labelCfg.labelEstH,
    labelCfg.labelGap,
    viewportW,
    viewportH,
    labelCfg.labelPad,
  );

  const { labelPad, labelEstW, labelEstH, labelGap, dotPad } = labelCfg;

  if (
    projectedX < dotPad ||
    projectedX > viewportW - dotPad ||
    projectedY < dotPad ||
    projectedY > viewportH - dotPad
  ) {
    return false;
  }

  let left: number;
  let right: number;
  let top: number;
  let bottom: number;

  if (anchor === 'above') {
    left = x - labelEstW / 2;
    right = x + labelEstW / 2;
    top = y - labelEstH - labelGap;
    bottom = y;
  } else if (anchor === 'left') {
    left = x - labelEstW - labelGap;
    right = x;
    top = y - labelEstH / 2;
    bottom = y + labelEstH / 2;
  } else {
    left = x + labelGap;
    right = x + labelGap + labelEstW;
    top = y - labelEstH / 2;
    bottom = y + labelEstH / 2;
  }

  return (
    left >= labelPad &&
    right <= viewportW - labelPad &&
    top >= labelPad &&
    bottom <= viewportH - labelPad
  );
}

/**
 * Finds the closest camera distance (max zoom) that keeps every station dot and
 * label fully inside the viewport, centered on India's station bounding box.
 */
function computeIndiaFraming(
  camera: THREE.PerspectiveCamera,
  earthGroup: THREE.Group,
  viewportW: number,
  viewportH: number,
  latLonToVector3: (lat: number, lon: number, radius: number) => THREE.Vector3,
): IndiaFramingConfig {
  const focus = computeIndiaFocusPoint();
  const labelCfg = getLabelLayoutConfig(viewportW, viewportH);

  const stationPositions = INDIA_AIRPORTS.map((airport) => ({
    localPos: latLonToVector3(
      airport.plotLat ?? airport.lat,
      airport.plotLon ?? airport.lon,
      CONFIG.R + CONFIG.DOT_RAISE,
    ),
    city: airport.city,
  }));

  const mapProbes = getIndiaMapProbePoints().map(({ lat, lon }) =>
    latLonToVector3(lat, lon, CONFIG.R),
  );

  const scratch = {
    wp: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    toCam: new THREE.Vector3(),
  };

  const fitsAtDistance = (distance: number): boolean => {
    const pos = indiaFacingCameraPosition(
      focus.lat,
      focus.lon,
      distance,
      latLonToVector3,
    );
    camera.position.copy(pos);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    return stationPositions.every(({ localPos, city }) =>
      stationScreenFits(
        localPos,
        city,
        camera,
        earthGroup,
        viewportW,
        viewportH,
        labelCfg,
        scratch,
      ),
    ) && mapProbes.every((probe) =>
      mapProbeScreenFits(
        probe,
        camera,
        earthGroup,
        viewportW,
        viewportH,
        labelCfg.dotPad * 1.25,
        scratch,
      ),
    );
  };

  let lo = CONFIG.R * 1.05;
  let hi = 22;
  if (!fitsAtDistance(hi)) {
    hi = 26;
  }

  let best = hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fitsAtDistance(mid)) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  if (!fitsAtDistance(best)) {
    best = Math.min(26, best * 1.04);
  }

  return {
    indiaLat: focus.lat,
    indiaLon: focus.lon,
    cameraDistance: best,
    ...labelCfg,
  };
}

/** Original desktop / tablet framing — unchanged from the landing globe defaults. */
function getDesktopFramingConfig(): IndiaFramingConfig {
  return {
    indiaLat: CONFIG.INDIA_LAT,
    indiaLon: CONFIG.INDIA_LON,
    cameraDistance: CONFIG.CAMERA_FINAL_DISTANCE,
    labelPad: 10,
    labelEstW: 68,
    labelEstH: 26,
    labelGap: 14,
    dotPad: 14,
  };
}

function resolveViewportGlobeConfig(
  camera: THREE.PerspectiveCamera,
  earthGroup: THREE.Group,
  viewportW: number,
  viewportH: number,
  latLonToVector3: (lat: number, lon: number, radius: number) => THREE.Vector3,
): IndiaFramingConfig {
  if (!isMobileGlobeViewport(viewportW)) {
    return getDesktopFramingConfig();
  }
  return computeIndiaFraming(
    camera,
    earthGroup,
    viewportW,
    viewportH,
    latLonToVector3,
  );
}

function indiaFacingCameraPosition(
  lat: number,
  lon: number,
  distance: number,
  latLonToVector3: (lat: number, lon: number, radius: number) => THREE.Vector3,
): THREE.Vector3 {
  return latLonToVector3(lat, lon, CONFIG.R)
    .clone()
    .normalize()
    .multiplyScalar(distance);
}

/** Distributes motion across the whole duration (unlike ease-out-expo, which finishes most travel in the first ~20% of time). */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** One smooth arch per period: 0 → 1 → 0 (rest handled by caller). */
function stationHoverJumpEnvelope(
  hoverElapsedMs: number,
  jumpMs: number,
  restMs: number,
): number {
  const cycle = jumpMs + restMs;
  if (cycle <= 0) return 0;
  const t = hoverElapsedMs % cycle;
  if (t >= jumpMs) return 0;
  return Math.sin(Math.PI * (t / jumpMs));
}

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  properties: any;
}

/** Deterministic PRNG (seeded once; star positions never regenerated). */
function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let sharedStarSpriteTexture: THREE.CanvasTexture | null = null;

/** Opaque white billboard for PointsMaterial (no gradient / glow). */
function getSharedStarSpriteTexture(): THREE.CanvasTexture {
  if (sharedStarSpriteTexture) return sharedStarSpriteTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 16, 16);
  }
  sharedStarSpriteTexture = new THREE.CanvasTexture(canvas);
  sharedStarSpriteTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedStarSpriteTexture;
}

/** Uniform random radius in [r0, r1] for a spherical shell (uniform in volume between shells). */
function uniformShellRadius(r0: number, r1: number, rng: () => number): number {
  const a = r0 * r0 * r0;
  const b = r1 * r1 * r1;
  return Math.cbrt(a + rng() * (b - a));
}

/**
 * Evenly distributed direction on S² (Fibonacci sphere) + tiny seeded jitter to soften grid lines.
 * Deterministic for given (layerIndex, i, count, shellSeed).
 */
function fibonacciSphereDirection(
  i: number,
  count: number,
  rng: () => number,
  out: THREE.Vector3,
): void {
  const n = Math.max(count, 2);
  const y = 1 - (i / (n - 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const theta = golden * i;
  const jx = (rng() - 0.5) * 0.02;
  const jy = (rng() - 0.5) * 0.02;
  const jz = (rng() - 0.5) * 0.02;
  out.set(Math.cos(theta) * ring + jx, y + jy, Math.sin(theta) * ring + jz).normalize();
}

type StarShellConfig = {
  r0: number;
  r1: number;
  count: number;
  /** Scales CONFIG.STAR_BASE_SIZE; keep within ~0.8–1.2 for subtle variation. */
  sizeMul: number;
};

function createStarPointsMaterial(
  size: number,
  vertexColors: boolean,
): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color: 0xffffff,
    vertexColors,
    map: getSharedStarSpriteTexture(),
    size,
    sizeAttenuation: true,
    transparent: false,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
}

function fillShellPoints(
  shell: StarShellConfig,
  layerIndex: number,
  verts: number[],
) {
  const posRng = mulberry32(CONFIG.STARFIELD_SEED + layerIndex * 9973);
  const v = new THREE.Vector3();
  for (let i = 0; i < shell.count; i++) {
    const r = uniformShellRadius(shell.r0, shell.r1, posRng);
    fibonacciSphereDirection(i, shell.count, posRng, v);
    verts.push(v.x * r, v.y * r, v.z * r);
  }
}

/** Stellar B–V-ish tints: cool blue-whites vs warm yellow-whites (deterministic per star). */
function fillShellStarColors(
  shell: StarShellConfig,
  layerIndex: number,
  cols: number[],
) {
  for (let i = 0; i < shell.count; i++) {
    const t =
      ((i * 0.6180339887 + layerIndex * 2.3999632) % 1 + 1) % 1;
    const cool = t < 0.62;
    if (cool) {
      const s = 0.72 + t * 0.26;
      cols.push(s * 0.92, s * 0.95, 1.0);
    } else {
      const s = 0.78 + (1 - t) * 0.22;
      cols.push(1.0, s * 0.97, s * 0.82);
    }
  }
}

/**
 * World-space star field: Fibonacci-sphere shells. Each shell yaws at a
 * different rate plus a slow parent roll so the sky drifts like a deep star field.
 */
function getStarfield(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'starfieldRoot';

  let layerIndex = 0;

  for (const shell of CONFIG.STAR_SHELLS) {
    const verts: number[] = [];
    const colors: number[] = [];
    fillShellPoints(shell, layerIndex, verts);
    fillShellStarColors(shell, layerIndex, colors);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const size = CONFIG.STAR_BASE_SIZE * shell.sizeMul;
    const mat = createStarPointsMaterial(size, true);

    const points = new THREE.Points(geo, mat);
    points.name = `stars_layer_${layerIndex}`;
    group.add(points);
    layerIndex += 1;
  }

  return group;
}

type EarthSceneProps = {
  skipIntro?: boolean;
  /** Begin the space-to-India dolly (gated so it never plays behind the overlay). */
  startCameraFly?: boolean;
  /** Jump to the India framing (Skip, reduced motion, returning users). */
  snapToTarget?: boolean;
  reduceMotion?: boolean;
};

export default function EarthScene({
  skipIntro = false,
  startCameraFly = false,
  snapToTarget = false,
  reduceMotion = false,
}: EarthSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const startCameraFlyRef = useRef(startCameraFly);
  const snapToTargetRef = useRef(snapToTarget);
  const reduceMotionRef = useRef(reduceMotion);
  startCameraFlyRef.current = startCameraFly;
  snapToTargetRef.current = snapToTarget;
  reduceMotionRef.current = reduceMotion;
  const [selectedAirport, setSelectedAirport] = useState<any>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [globeError, setGlobeError] = useState(false);
  const [globeEpoch, setGlobeEpoch] = useState(0);
  const [weatherData, setWeatherData] = useState<Record<string, any>>({});

  const navigateToStationLogin = useCallback(
    (airport: (typeof INDIA_AIRPORTS)[number]) => {
      const url = appendLoginReturnNext(buildLoginStationUrl(airport));
      persistLoginStationSelection({
        stationCode: airport.stationCode,
        stationName: airport.airport,
        stationCity: airport.city,
      });
      // Full load. router.push is ignored after browser Back (same URL is the
      // forward entry) and after a history.state wipe on the station map.
      window.location.assign(url);
    },
    [],
  );
  const navigateToStationLoginRef = useRef(navigateToStationLogin);
  navigateToStationLoginRef.current = navigateToStationLogin;

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setGlobeEpoch((n) => n + 1);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    if (globeError) return;
    if (!mountRef.current) return;

    let disposeScene: (() => void) | undefined;
    let effectCancelled = false;

    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let earthGroup: THREE.Group | null = null;
    let renderRaf: number | null = null;
    type CameraFly = {
      start: number;
      duration: number;
      from: THREE.Vector3;
      to: THREE.Vector3;
      done: boolean;
      started: boolean;
    };
    let cameraFly: CameraFly | null = null;
    let airportDots: THREE.Mesh[] = [];
    let raycaster: THREE.Raycaster | null = null;
    let mouse: THREE.Vector2 | null = null;
    let stars: THREE.Group | null = null;
    let lastTime = 0;
    let spaceBgTexture: THREE.DataTexture | null = null;

    const latLonToVector3 = (
      lat: number,
      lon: number,
      radius: number,
    ): THREE.Vector3 => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);

      return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      );
    };

    const createStarField = () => {
      try {
        stars = getStarfield();
        if (scene) {
          scene.add(stars);
        }
      } catch (err) {
        console.error('Error creating star field:', err);
      }
    };

    const setupLighting = () => {
      if (!scene) return;

      // Sky / ground bounce reads brighter and more “daytime” than flat ambient alone.
      scene.add(
        new THREE.HemisphereLight(0xb4d4ff, 0x353842, 0.55),
      );

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));

      const sunLight = new THREE.DirectionalLight(0xfff6ec, 3.35);
      sunLight.position.set(-120, 55, -80);
      scene.add(sunLight);

      const fillLight = new THREE.DirectionalLight(0xd4e2ff, 0.55);
      fillLight.position.set(70, 20, 60);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xc8ddff, 0.45);
      rimLight.position.set(-30, 12, -90);
      scene.add(rimLight);
    };

    const drawIndiaBorders = async (parent: THREE.Group) => {
      try {
        const res = await fetch('/geo/india-states.json');
        if (!res.ok) {
          return;
        }
        const indiaStates = (await res.json()) as GeoFeatureCollection;

        if (
          !indiaStates ||
          !indiaStates.features ||
          indiaStates.features.length === 0
        ) {
          console.error('India states data is empty or invalid');
          return;
        }

        const radius = CONFIG.R + 0.018;

        const borderMaterial = new THREE.LineBasicMaterial({
          color: CONFIG.INDIA_BORDER_COLOR,
          linewidth: 1,
          transparent: true,
          opacity: CONFIG.INDIA_BORDER_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });

        indiaStates.features.forEach((feature, index) => {
          const props = feature.properties as Record<string, unknown> | undefined;
          const stateName =
            (props?.NAME_1 as string | undefined) ||
            (props?.STATE as string | undefined) ||
            (props?.st_nm as string | undefined) ||
            (props?.name as string | undefined) ||
            `State ${index + 1}`;

          if (feature.geometry.type === 'Polygon') {
            const coordinates = feature.geometry.coordinates as number[][][];

            coordinates.forEach((ring: number[][], ringIndex: number) => {
              const points: THREE.Vector3[] = [];

              ring.forEach(([lon, lat]: number[]) => {
                if (
                  typeof lat === 'number' &&
                  typeof lon === 'number' &&
                  !isNaN(lat) &&
                  !isNaN(lon)
                ) {
                  const point = latLonToVector3(lat, lon, radius);
                  points.push(point);
                }
              });

              if (points.length >= 2) {
                try {
                  const geometry = new THREE.BufferGeometry().setFromPoints(
                    points,
                  );
                  const line = new THREE.Line(geometry, borderMaterial);
                  line.userData = { stateName };
                  line.renderOrder = 1;
                  parent.add(line);
                } catch (error) {
                  console.error(
                    `Error creating geometry for ${stateName}, ring ${ringIndex}:`,
                    error,
                  );
                }
              }
            });
          } else if (feature.geometry.type === 'MultiPolygon') {
            const coordinates = feature.geometry.coordinates as number[][][][];

            coordinates.forEach((polygon: number[][][]) => {
              polygon.forEach((ring: number[][]) => {
                const points: THREE.Vector3[] = [];

                ring.forEach(([lon, lat]: number[]) => {
                  if (
                    typeof lat === 'number' &&
                    typeof lon === 'number' &&
                    !isNaN(lat) &&
                    !isNaN(lon)
                  ) {
                    const point = latLonToVector3(lat, lon, radius);
                    points.push(point);
                  }
                });

                if (points.length >= 2) {
                  try {
                    const geometry = new THREE.BufferGeometry().setFromPoints(
                      points,
                    );
                    const line = new THREE.Line(geometry, borderMaterial);
                    line.userData = { stateName };
                    line.renderOrder = 1;
                    parent.add(line);
                  } catch (error) {
                    console.error(
                      `Error creating geometry for ${stateName}:`,
                      error,
                    );
                  }
                }
              });
            });
          } else {
            console.warn(
              `Unsupported geometry type for ${stateName}: ${feature.geometry.type}`,
            );
          }
        });
      } catch (error) {
        console.error('Failed to draw India borders:', error);
      }
    };

   const createAirportDots = (parent: THREE.Group) => {
  airportDots = [];
  const isMobileViewport = isMobileGlobeViewport(
    mountRef.current?.clientWidth ?? 1024,
  );
  const dotSize = CONFIG.DOT_SIZE * (isMobileViewport ? 1.25 : 1);
  const clickZoneRadius =
    CONFIG.CLICK_ZONE_RADIUS * (isMobileViewport ? 1.5 : 1);

  INDIA_AIRPORTS.forEach((airport) => {
    const radius = CONFIG.R + CONFIG.DOT_RAISE;
    const plotLat = airport.plotLat ?? airport.lat;
    const plotLon = airport.plotLon ?? airport.lon;
    const position = latLonToVector3(plotLat, plotLon, radius);
    
    // Create white dot with emissive material
    const dotGeometry = new THREE.CircleGeometry(
      dotSize,
      CONFIG.DOT_SEGMENTS,
    );
    
    // White material for the dot
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, // Pure white
      side: THREE.DoubleSide,
    });
    
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.copy(position);

    const normal = position.clone().normalize();
    dot.lookAt(normal.multiplyScalar(100));

    // Create white outer ring (circle)
    const ringGeometry = new THREE.RingGeometry(
      CONFIG.RING_INNER,
      CONFIG.RING_OUTER,
      CONFIG.RING_SEGMENTS,
    );

    // White ring material
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, // Pure white
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    ring.lookAt(normal.multiplyScalar(100));

    // Store metadata with animation properties
    dot.userData = {
      type: 'airport',
      airportData: airport,
      ringMesh: ring,
      originalScale: 1,
      hoverTime: 0,
      isHovered: false,
    };

    // Invisible click zone
    const clickZone = new THREE.Mesh(
      new THREE.SphereGeometry(clickZoneRadius, 8, 8),
      new THREE.MeshBasicMaterial({
        visible: false,
      }),
    );

    clickZone.position.copy(position);
    clickZone.userData = {
      type: 'airport',
      airportData: airport,
      dotMesh: dot,
      ringMesh: ring,
      hovered: false,
      hoverStartTime: 0,
      originalDotColor: 0xffffff, // Store original white color
      originalRingColor: 0xffffff, // Store original white color
    };

    parent.add(dot);
    parent.add(ring);
    parent.add(clickZone);
    airportDots.push(clickZone);
  });
};

    const updateDotAnimations = (deltaTime: number) => {
  airportDots.forEach((clickZone: any) => {
    const dot = clickZone.userData.dotMesh;
    const ring = clickZone.userData.ringMesh;
    const isHovered = clickZone.userData.hovered;

    if (dot && ring) {
      // Handle color change on hover
      if (isHovered) {
        // Change to emerald-500 color (#10b981)
        const emeraldColor = 0x10b981;
        
        if (dot.material instanceof THREE.MeshBasicMaterial) {
          dot.material.color.setHex(emeraldColor);
        }
        if (ring.material instanceof THREE.MeshBasicMaterial) {
          ring.material.color.setHex(emeraldColor);
        }

        if (!clickZone.userData.hoverStartTime) {
          clickZone.userData.hoverStartTime = performance.now();
        }

        const hoverElapsed =
          performance.now() - clickZone.userData.hoverStartTime;
        const env = stationHoverJumpEnvelope(
          hoverElapsed,
          CONFIG.STATION_JUMP_DURATION_MS,
          CONFIG.STATION_JUMP_REST_MS,
        );
        const bounceScale = reduceMotionRef.current
          ? 1
          : 1 + env * CONFIG.STATION_JUMP_SCALE_AMP;

        dot.scale.setScalar(bounceScale);
        ring.scale.setScalar(bounceScale);

        const labelEl = clickZone.userData.labelEl as HTMLElement | undefined;
        const inner = labelEl?.querySelector(
          '.earth-station-tag__inner',
        ) as HTMLElement | null;
        if (inner && !reduceMotionRef.current) {
          const ty = env * CONFIG.STATION_LABEL_TY_PX;
          const ls = 1 + env * CONFIG.STATION_LABEL_SCALE_AMP;
          inner.style.transform = `translateY(${-ty}px) scale(${ls})`;
        }
      } else {
        // Reset to white color
        if (clickZone.userData.originalDotColor) {
          if (dot.material instanceof THREE.MeshBasicMaterial) {
            dot.material.color.setHex(clickZone.userData.originalDotColor);
          }
          if (ring.material instanceof THREE.MeshBasicMaterial) {
            ring.material.color.setHex(clickZone.userData.originalRingColor);
          }
        }

        clickZone.userData.hoverStartTime = 0;

        // Smoothly return to normal scale
        dot.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
        ring.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);

        const labelEl = clickZone.userData.labelEl as HTMLElement | undefined;
        const inner = labelEl?.querySelector(
          '.earth-station-tag__inner',
        ) as HTMLElement | null;
        inner?.style.removeProperty('transform');
      }
    }
  });
};

    const setupMouseInteraction = (
      mountEl: HTMLElement | null,
      labelsLayerEl: HTMLElement,
    ) => {
      if (!camera || !scene || !renderer || !mountEl) return () => {};

      raycaster = new THREE.Raycaster();
      mouse = new THREE.Vector2();

      const canvas = renderer.domElement;

      const setPointerNDC = (event: MouseEvent) => {
        if (!mouse) return;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width || 1;
        const h = rect.height || 1;
        mouse.x = ((event.clientX - rect.left) / w) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / h) * 2 + 1;
      };

      const syncShaderHover = (clickZone: any, hovered: boolean) => {
        const dotM = clickZone.userData.dotMesh?.material;
        const ringM = clickZone.userData.ringMesh?.material;
        if (dotM instanceof THREE.ShaderMaterial) {
          dotM.uniforms.isHovered.value = hovered ? 1 : 0;
          if (hovered) dotM.uniforms.glowColor.value.setHex(CONFIG.DOT_HOVER_COLOR);
        }
        if (ringM instanceof THREE.ShaderMaterial) {
          ringM.uniforms.isHovered.value = hovered ? 1 : 0;
          if (hovered) ringM.uniforms.glowColor.value.setHex(CONFIG.DOT_HOVER_COLOR);
        }
      };

      const clearHoverExcept = (keep: any | null) => {
        airportDots.forEach((clickZone: any) => {
          const stay = keep === clickZone;
          if (!stay && clickZone.userData.hovered) {
            clickZone.userData.hovered = false;
            syncShaderHover(clickZone, false);
          }
        });
      };

      const resolveHoveredStation = (
        event: MouseEvent,
      ): { zone: any; airportData: (typeof INDIA_AIRPORTS)[number] } | null => {
        const tagUnder = (event.target as HTMLElement | null)?.closest?.(
          '.earth-station-tag',
        ) as HTMLElement | null;
        if (
          tagUnder &&
          labelsLayerEl.contains(tagUnder) &&
          !labelsLayerEl.classList.contains('earth-scene-station-labels--hidden')
        ) {
          const code = tagUnder.dataset.stationCode;
          if (code) {
            const zone = airportDots.find(
              (cz: any) => cz.userData.airportData?.stationCode === code,
            );
            if (zone) return { zone, airportData: zone.userData.airportData };
          }
        }

        setPointerNDC(event);
        raycaster!.setFromCamera(mouse!, camera!);
        const intersects = raycaster!.intersectObjects(airportDots);
        if (intersects.length > 0) {
          const z = intersects[0].object;
          return {
            zone: z,
            airportData: z.userData.airportData,
          };
        }
        return null;
      };

      const onMouseMove = (event: MouseEvent) => {
        if (!camera || !scene || !raycaster || !mouse) return;

        const resolved = resolveHoveredStation(event);
        applyStationHover(resolved, event.clientX, event.clientY);
      };

      const applyStationHover = (
        resolved: { zone: any; airportData: (typeof INDIA_AIRPORTS)[number] } | null,
        clientX: number,
        clientY: number,
      ) => {
        clearHoverExcept(resolved?.zone ?? null);

        if (resolved) {
          if (!resolved.zone.userData.hovered) {
            resolved.zone.userData.hovered = true;
            syncShaderHover(resolved.zone, true);
          }
          canvas.style.cursor = 'pointer';
          setSelectedAirport(resolved.airportData);
          setPopupPosition(
            getAirportCardScreenPosition(
              clientX,
              clientY,
              window.innerWidth,
              window.innerHeight,
            ),
          );
        } else {
          canvas.style.cursor = '';
          setSelectedAirport(null);
        }
      };

      const onFocusIn = (event: FocusEvent) => {
        const tag = (event.target as HTMLElement | null)?.closest?.(
          '.earth-station-tag',
        ) as HTMLElement | null;
        if (!tag || !labelsLayerEl.contains(tag)) return;
        const code = tag.dataset.stationCode;
        const zone = airportDots.find(
          (cz: any) => cz.userData.airportData?.stationCode === code,
        );
        if (!zone) return;
        const rect = tag.getBoundingClientRect();
        applyStationHover(
          { zone, airportData: zone.userData.airportData },
          rect.right,
          rect.top,
        );
      };

      const onFocusOut = (event: FocusEvent) => {
        const next = event.relatedTarget as HTMLElement | null;
        if (next && labelsLayerEl.contains(next)) return;
        applyStationHover(null, 0, 0);
      };

      const onClick = (event: MouseEvent) => {
        if (!camera || !scene || !raycaster || !mouse) return;

        const tagUnder = (event.target as HTMLElement | null)?.closest?.(
          '.earth-station-tag',
        ) as HTMLElement | null;
        if (tagUnder && labelsLayerEl.contains(tagUnder)) {
          const code = tagUnder.dataset.stationCode;
          const airport = INDIA_AIRPORTS.find(
            (entry) => entry.stationCode === code,
          );
          if (airport) {
            navigateToStationLoginRef.current(airport);
          }
          return;
        }

        setPointerNDC(event);

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(airportDots);

        if (intersects.length > 0) {
          const airportData = intersects[0]?.object?.userData?.airportData as
            | (typeof INDIA_AIRPORTS)[number]
            | undefined;
          if (airportData) {
            navigateToStationLoginRef.current(airportData);
          }
        }
      };

      mountEl.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('click', onClick);
      labelsLayerEl.addEventListener('click', onClick);
      labelsLayerEl.addEventListener('focusin', onFocusIn);
      labelsLayerEl.addEventListener('focusout', onFocusOut);

      return () => {
        mountEl.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('click', onClick);
        labelsLayerEl.removeEventListener('click', onClick);
        labelsLayerEl.removeEventListener('focusin', onFocusIn);
        labelsLayerEl.removeEventListener('focusout', onFocusOut);
        canvas.style.cursor = '';
      };
    };

    const init = async () => {
      const mountEl = mountRef.current;
      if (!mountEl) return () => {};

      scene = new THREE.Scene();
      spaceBgTexture = createDeepSpaceEquirectTexture();
      scene.background = spaceBgTexture;

      camera = new THREE.PerspectiveCamera(
        45,
        mountEl.clientWidth / mountEl.clientHeight,
        0.1,
        1000,
      );

      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        });
      } catch {
        setGlobeError(true);
        return () => {};
      }
      // Parent may still be laying out on first paint — never init at 0×0.
      const initialW = Math.max(mountEl.clientWidth || window.innerWidth, 1);
      const initialH = Math.max(mountEl.clientHeight || window.innerHeight, 1);
      renderer.setSize(initialW, initialH);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.14;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.inset = '0';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      const onContextLost = (event: Event) => {
        event.preventDefault();
        setGlobeError(true);
      };
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);

      mountEl.appendChild(renderer.domElement);

      const stationScreenLabels: Array<{
        localPos: THREE.Vector3;
        el: HTMLElement;
      }> = [];
      const labelsLayer = document.createElement('div');
      labelsLayer.className = 'earth-scene-station-labels';
      labelsLayer.setAttribute('role', 'navigation');
      labelsLayer.setAttribute('aria-label', 'Bird Group stations');
      labelsLayer.setAttribute('aria-hidden', 'true');
      mountEl.appendChild(labelsLayer);
      labelsLayer.classList.add('earth-scene-station-labels--hidden');
      let areStationLabelsVisible = false;
      const initialMobileGlobe = isMobileGlobeViewport(mountEl.clientWidth);

      for (const airport of INDIA_AIRPORTS) {
        const radius = CONFIG.R + CONFIG.DOT_RAISE;
        const plotLat = airport.plotLat ?? airport.lat;
        const plotLon = airport.plotLon ?? airport.lon;
        const position = latLonToVector3(plotLat, plotLon, radius);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'earth-station-tag';
        row.dataset.stationCode = airport.stationCode;
        row.setAttribute(
          'aria-label',
          `${airport.city}, ${airport.stationCode}`,
        );
        const cityKey = String(airport.city).toLowerCase();
        const leftSet = initialMobileGlobe
          ? MOBILE_LEFT_SIDE_STATION_CITIES
          : DESKTOP_LEFT_SIDE_STATION_CITIES;
        const rightSet = initialMobileGlobe
          ? MOBILE_RIGHT_SIDE_STATION_CITIES
          : DESKTOP_RIGHT_SIDE_STATION_CITIES;
        if (leftSet.has(cityKey)) {
          row.classList.add('earth-station-tag--left');
        }
        if (rightSet.has(cityKey)) {
          row.classList.add('earth-station-tag--right');
        }
        if (cityKey === 'coimbatore') {
          row.classList.add('earth-station-tag--coimbatore');
        }
        const inner = document.createElement('span');
        inner.className = 'earth-station-tag__inner';
        const dotEl = document.createElement('span');
        dotEl.className = 'earth-station-tag__dot';
        const nameEl = document.createElement('span');
        nameEl.className = 'earth-station-tag__name';
        nameEl.textContent = airport.stationCode;
        inner.appendChild(dotEl);
        inner.appendChild(nameEl);
        row.appendChild(inner);
        labelsLayer.appendChild(row);
        stationScreenLabels.push({ localPos: position.clone(), el: row });
      }

      const wpLabel = new THREE.Vector3();
      const normalLabel = new THREE.Vector3();
      const toCamLabel = new THREE.Vector3();

      earthGroup = new THREE.Group();
      scene.add(earthGroup);

      const geometry = new THREE.SphereGeometry(CONFIG.R, 64, 64);
      // Same-origin local textures — do NOT set crossOrigin('anonymous') or
      // WebGL can reject the map when static assets lack CORS headers.
      const loader = new THREE.TextureLoader();

      // Load textures with error handling
      try {
        const earthTexture = await loadTextureFirstAvailable(
          loader,
          EARTH_DAY_TEXTURE_URLS,
        );
        if (effectCancelled) {
          earthTexture.dispose();
          return () => {
            if (labelsLayer && mountEl.contains(labelsLayer)) {
              mountEl.removeChild(labelsLayer);
            }
            if (renderer && mountEl.contains(renderer.domElement)) {
              mountEl.removeChild(renderer.domElement);
              renderer.dispose();
            }
          };
        }
        configureEarthSurfaceTexture(earthTexture, renderer);

        let normalMap: THREE.Texture | undefined;
        try {
          const n = await loadTextureFirstAvailable(
            loader,
            EARTH_NORMAL_TEXTURE_URLS,
          );
          configureEarthNormalTexture(n, renderer);
          normalMap = n;
        } catch {
          /* optional; bump below */
        }

        let bumpMap: THREE.Texture | undefined;
        if (!normalMap) {
          try {
            bumpMap = await loader.loadAsync(CONFIG.BUMP_URL);
            bumpMap.colorSpace = THREE.NoColorSpace;
            bumpMap.anisotropy = Math.min(
              16,
              renderer.capabilities.getMaxAnisotropy(),
            );
          } catch {
            bumpMap = undefined;
          }
        }

        let specMap: THREE.Texture | undefined;
        try {
          const s = await loadTextureFirstAvailable(
            loader,
            EARTH_SPECULAR_TEXTURE_URLS,
          );
          configureSpecularTexture(s, renderer);
          specMap = s;
        } catch {
          /* optional ocean specular */
        }

        const material = new THREE.MeshPhongMaterial({
          map: earthTexture,
          ...(normalMap
            ? {
                normalMap,
                normalScale: new THREE.Vector2(0.88, 0.88),
              }
            : bumpMap
              ? { bumpMap, bumpScale: 0.12 }
              : {}),
          ...(specMap ? { specularMap: specMap } : {}),
          specular: new THREE.Color(0x252d42),
          shininess: 28,
          emissive: new THREE.Color(0x03060c),
          emissiveIntensity: 0.2,
        });

        const earthMesh = new THREE.Mesh(geometry, material);
        earthMesh.receiveShadow = true;
        earthGroup.add(earthMesh);

        try {
          const cloudTex = await loadTextureFirstAvailable(
            loader,
            EARTH_CLOUDS_TEXTURE_URLS,
          );
          cloudTex.colorSpace = THREE.SRGBColorSpace;
          cloudTex.anisotropy = Math.min(
            16,
            renderer.capabilities.getMaxAnisotropy(),
          );
          const cloudMesh = new THREE.Mesh(
            new THREE.SphereGeometry(CONFIG.R + 0.058, 48, 48),
            new THREE.MeshBasicMaterial({
              map: cloudTex,
              transparent: true,
              opacity: 0.9,
              depthWrite: false,
              toneMapped: true,
            }),
          );
          cloudMesh.renderOrder = 2;
          earthGroup.add(cloudMesh);
        } catch {
          /* optional cloud deck */
        }
      } catch (error) {
        console.error('Failed to load Earth textures:', error);
        const earthMesh = new THREE.Mesh(geometry, createEarthFallbackMaterial());
        earthGroup.add(earthMesh);
      }

      if (effectCancelled) {
        return () => {
          if (labelsLayer && mountEl.contains(labelsLayer)) {
            mountEl.removeChild(labelsLayer);
          }
          if (renderer && mountEl.contains(renderer.domElement)) {
            mountEl.removeChild(renderer.domElement);
            renderer.dispose();
          }
        };
      }

      // Stars after the day map so GPU memory prefers the earth texture.
      createStarField();

      setupLighting();
      await drawIndiaBorders(earthGroup);
      if (effectCancelled) {
        return () => {
          if (
            labelsLayer &&
            mountEl.contains(labelsLayer)
          ) {
            mountEl.removeChild(labelsLayer);
          }
          if (renderer && mountEl.contains(renderer.domElement)) {
            mountEl.removeChild(renderer.domElement);
            renderer.dispose();
          }
        };
      }
      createAirportDots(earthGroup);

      for (let i = 0; i < airportDots.length; i++) {
        const cz = airportDots[i] as THREE.Mesh;
        cz.userData.labelEl = stationScreenLabels[i]?.el ?? null;
      }

      if (effectCancelled) {
        return () => {
          if (labelsLayer && mountEl.contains(labelsLayer)) {
            mountEl.removeChild(labelsLayer);
          }
          if (renderer && mountEl.contains(renderer.domElement)) {
            mountEl.removeChild(renderer.domElement);
            renderer.dispose();
          }
        };
      }

      const cleanupMouseInteraction = setupMouseInteraction(
        mountEl,
        labelsLayer,
      );

      let viewportGlobe = resolveViewportGlobeConfig(
        camera,
        earthGroup,
        mountEl.clientWidth,
        mountEl.clientHeight,
        latLonToVector3,
      );
      const targetPos = indiaFacingCameraPosition(
        viewportGlobe.indiaLat,
        viewportGlobe.indiaLon,
        viewportGlobe.cameraDistance,
        latLonToVector3,
      );
      const startPos = targetPos
        .clone()
        .multiplyScalar(CONFIG.CAMERA_START_DISTANCE_MULTIPLIER);

      const instantSettle =
        skipIntro || snapToTargetRef.current || reduceMotionRef.current;

      if (instantSettle) {
        camera.position.copy(targetPos);
        camera.lookAt(0, 0, 0);
        cameraFly = {
          start: 0,
          duration: 0,
          from: targetPos.clone(),
          to: targetPos.clone(),
          done: true,
          started: true,
        };
        labelsLayer.classList.remove('earth-scene-station-labels--hidden');
        labelsLayer.removeAttribute('aria-hidden');
        areStationLabelsVisible = true;
      } else {
        camera.position.copy(startPos);
        camera.lookAt(0, 0, 0);
        cameraFly = {
          start: 0,
          duration: CONFIG.CAMERA_FLY_DURATION_MS,
          from: startPos.clone(),
          to: targetPos.clone(),
          done: false,
          started: false,
        };
      }

      const renderLoop = (currentTime: number = 0) => {
        if (effectCancelled) return;
        if (typeof document !== 'undefined' && document.hidden) {
          renderRaf = null;
          return;
        }
        renderRaf = requestAnimationFrame(renderLoop);

        if (renderer && scene && camera) {
          if (!lastTime) lastTime = currentTime;
          const delta = Math.min(Math.max(currentTime - lastTime, 0), 64);
          lastTime = currentTime;

          if (cameraFly && !cameraFly.done) {
            if (snapToTargetRef.current || reduceMotionRef.current) {
              camera.position.copy(cameraFly.to);
              camera.lookAt(0, 0, 0);
              cameraFly.done = true;
              cameraFly.started = true;
            } else if (!cameraFly.started && startCameraFlyRef.current) {
              cameraFly.started = true;
              cameraFly.start = performance.now();
            }

            if (cameraFly.started && !cameraFly.done) {
              const elapsed = performance.now() - cameraFly.start;
              const t = Math.min(
                elapsed / Math.max(cameraFly.duration, 1),
                1,
              );
              const eased = easeInOutCubic(t);
              camera.position.lerpVectors(cameraFly.from, cameraFly.to, eased);
              camera.lookAt(0, 0, 0);
              if (t >= 1) {
                camera.position.copy(cameraFly.to);
                camera.lookAt(0, 0, 0);
                cameraFly.done = true;
              }
            }
          }

          if (cameraFly?.done && !areStationLabelsVisible) {
            labelsLayer.classList.remove('earth-scene-station-labels--hidden');
            labelsLayer.removeAttribute('aria-hidden');
            areStationLabelsVisible = true;
          }

          updateDotAnimations(delta);

          if (stars && !reduceMotionRef.current) {
            const dt = delta / 1000;
            const base = CONFIG.STARFIELD_YAW_RAD_PER_SEC;
            stars.rotation.z += base * CONFIG.STARFIELD_ROLL_FRAC * dt;
            const n = stars.children.length;
            stars.children.forEach((child, i) => {
              if (child instanceof THREE.Points) {
                const t = n > 1 ? i / (n - 1) : 0.5;
                const rateMul = 0.38 + t * 1.25;
                child.rotation.y += base * rateMul * dt;
              }
            });
          }

          if (
            earthGroup &&
            camera &&
            mountRef.current &&
            stationScreenLabels.length > 0
          ) {
            const w = mountRef.current.clientWidth;
            const h = mountRef.current.clientHeight;
            const mobileLabels = isMobileGlobeViewport(w);
            for (const { localPos, el } of stationScreenLabels) {
              wpLabel.copy(localPos).applyMatrix4(earthGroup.matrixWorld);
              normalLabel.copy(wpLabel).normalize();
              toCamLabel.copy(camera.position).sub(wpLabel).normalize();
              if (normalLabel.dot(toCamLabel) <= 0) {
                el.style.visibility = 'hidden';
                continue;
              }
              wpLabel.project(camera);
              const projectedX = (wpLabel.x * 0.5 + 0.5) * w;
              const projectedY = (-wpLabel.y * 0.5 + 0.5) * h;
              el.style.visibility = 'visible';
              if (mobileLabels) {
                const anchor = getStationLabelAnchor(el);
                const { x, y } = clampStationLabelScreenPosition(
                  projectedX,
                  projectedY,
                  anchor,
                  viewportGlobe.labelEstW,
                  viewportGlobe.labelEstH,
                  viewportGlobe.labelGap,
                  w,
                  h,
                  viewportGlobe.labelPad,
                );
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
              } else {
                el.style.left = `${projectedX}px`;
                el.style.top = `${projectedY}px`;
              }
            }
          }

          renderer.render(scene, camera);
        }
      };

      renderLoop();

      const onVisibility = () => {
        if (!document.hidden && renderRaf === null && !effectCancelled) {
          lastTime = 0;
          renderLoop();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      const handleResize = () => {
        if (!camera || !renderer || !mountRef.current) return;
        const { clientWidth, clientHeight } = mountRef.current;
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight);
        if (cameraFly?.done && earthGroup && isMobileGlobeViewport(clientWidth)) {
          viewportGlobe = computeIndiaFraming(
            camera,
            earthGroup,
            clientWidth,
            clientHeight,
            latLonToVector3,
          );
          const resizedTarget = indiaFacingCameraPosition(
            viewportGlobe.indiaLat,
            viewportGlobe.indiaLon,
            viewportGlobe.cameraDistance,
            latLonToVector3,
          );
          camera.position.copy(resizedTarget);
          camera.lookAt(0, 0, 0);
          cameraFly.to.copy(resizedTarget);
        } else if (!isMobileGlobeViewport(clientWidth)) {
          viewportGlobe = getDesktopFramingConfig();
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', onVisibility);
        renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
        cleanupMouseInteraction?.();
        if (renderRaf !== null) cancelAnimationFrame(renderRaf);
        if (scene) {
          scene.background = null;
        }
        spaceBgTexture?.dispose();
        spaceBgTexture = null;
        if (
          labelsLayer &&
          mountEl.contains(labelsLayer)
        ) {
          mountEl.removeChild(labelsLayer);
        }
        if (
          renderer &&
          mountEl.contains(renderer.domElement)
        ) {
          mountEl.removeChild(renderer.domElement);
          renderer.dispose();
        }
      };
    };

    init().then((disposeFn) => {
      if (typeof disposeFn !== 'function') return;
      if (effectCancelled) {
        disposeFn();
      } else {
        disposeScene = disposeFn;
      }
    }).catch((err) => {
      console.error('[EarthScene] init failed:', err);
      setGlobeError(true);
      if (renderer && mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
        renderer.dispose();
      }
    });

    return () => {
      effectCancelled = true;
      disposeScene?.();
      disposeScene = undefined;
      // Stop RAF if dispose never registered (mid-flight cancel).
      if (renderRaf !== null) {
        cancelAnimationFrame(renderRaf);
        renderRaf = null;
      }
    };
  }, [skipIntro, globeError, globeEpoch]);

  if (globeError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#03050d] px-4 py-10 text-white">
        <h2 className="text-xl font-semibold">Choose a station</h2>
        <p className="mt-2 max-w-md text-center text-sm text-white/70">
          The 3D globe could not start on this device. Sign in from the list below.
        </p>
        <ul className="mt-8 grid w-full max-w-lg gap-2">
          {INDIA_AIRPORTS.map((airport) => (
            <li key={airport.stationCode}>
              <button
                type="button"
                onClick={() => navigateToStationLogin(airport)}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm transition-colors duration-150 hover:border-emerald-400/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-[0.99]"
              >
                <span className="font-medium">{airport.city}</span>
                <span className="text-emerald-400">{airport.stationCode}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#03050d]">
      <p className="sr-only">
        Interactive globe of Bird Group stations in India. Select a station to sign in.
      </p>
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {selectedAirport && (
        <div
          role="tooltip"
          aria-hidden="true"
          className="fixed z-50 cursor-pointer rounded-xl border border-emerald-400/40 bg-gray-900/60 p-0 backdrop-blur-lg drop-shadow-emerald-500 drop-shadow-xl/50"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            minWidth: `min(${CONFIG.AIRPORT_CARD_MIN_W}px, calc(100vw - 20px))`,
            maxWidth: `min(${CONFIG.AIRPORT_CARD_MAX_W}px, calc(100vw - 20px))`,
          }}
          onClick={() => navigateToStationLogin(selectedAirport)}
        >
          {selectedAirport.image && (
            <div className="relative h-28 w-full overflow-hidden rounded-t-xl">
              <img
                src={selectedAirport.image}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900 to-transparent px-3 pb-1.5 pt-4">
                <div className="text-sm font-bold text-white">
                  {selectedAirport.city}
                </div>
              </div>
            </div>
          )}

          <div className="p-3">
            <div className="mb-2 text-sm tracking-wide text-emerald-400">
              <p className="font-bold">{selectedAirport.company}</p>
            </div>

            <div className="mb-2 text-sm font-medium leading-snug text-white">
              {selectedAirport.airport}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
