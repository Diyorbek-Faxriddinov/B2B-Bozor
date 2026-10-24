/**
 * Geo services: road routing (OSRM), place search (Photon), reverse geocoding (Nominatim)
 * and geometry helpers. All providers are configurable via env so the backend can proxy them.
 *
 * Usage-policy notes:
 *  - Nominatim forbids client-side autocomplete and allows ≤1 request/second → used only for
 *    reverse geocoding, throttled and cached.
 *  - Photon (komoot) is built for type-ahead search → used for address autocomplete.
 *  - router.project-osrm.org is a demo server; set VITE_OSRM_URL to a self-hosted OSRM in production.
 */
import type { GeoPoint, Locale, RouteGeometry } from '@/types';
import { haversineKm, sleep } from './utils';

const env = import.meta.env;
export const GEO = {
  osrm: ((env.VITE_OSRM_URL as string) || 'https://router.project-osrm.org').replace(/\/$/, ''),
  photon: ((env.VITE_PHOTON_URL as string) || 'https://photon.komoot.io').replace(/\/$/, ''),
  nominatim: ((env.VITE_NOMINATIM_URL as string) || 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
};

/** Uzbekistan bounding box. */
export const UZ_BOUNDS = { south: 37.1, west: 55.9, north: 45.6, east: 73.2 };
export const UZ_LEAFLET_BOUNDS: [[number, number], [number, number]] = [
  [UZ_BOUNDS.south - 0.5, UZ_BOUNDS.west - 0.5],
  [UZ_BOUNDS.north + 0.5, UZ_BOUNDS.east + 0.5],
];

/** Straight line → road distance factor used when routing is unavailable. */
const ROAD_FACTOR = 1.3;
/** Average urban speed for estimates (km/h). */
const AVG_SPEED_KMH = 28;
/** OSRM ignores traffic; Tashkent rush hours are slower. */
const TRAFFIC_FACTOR = 1.25;

export function inUzbekistan(p: GeoPoint) {
  return p.lat >= UZ_BOUNDS.south && p.lat <= UZ_BOUNDS.north && p.lng >= UZ_BOUNDS.west && p.lng <= UZ_BOUNDS.east;
}

async function fetchJson<T>(url: string, { timeoutMs = 8000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const key = (p: GeoPoint, digits = 5) => `${p.lat.toFixed(digits)},${p.lng.toFixed(digits)}`;

/* ======================================================================
   Routing
   ====================================================================== */

/** Evenly samples a polyline down to `max` points, always keeping both ends. */
export function simplifyPath(points: [number, number][], max = 200): [number, number][] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

export function estimateRoute(from: GeoPoint, to: GeoPoint): RouteGeometry {
  const distanceKm = Math.round(haversineKm(from, to) * ROAD_FACTOR * 10) / 10;
  return {
    distanceKm,
    durationMin: Math.max(1, Math.round((distanceKm / AVG_SPEED_KMH) * 60)),
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    source: 'estimate',
  };
}

const routeCache = new Map<string, Promise<RouteGeometry>>();

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

/**
 * Fastest driving route. Never throws — falls back to a straight-line estimate.
 * Results are shared between callers, so the request is intentionally not abortable.
 */
export function getRoute(from: GeoPoint, to: GeoPoint): Promise<RouteGeometry> {
  if (haversineKm(from, to) < 0.02) {
    return Promise.resolve({ distanceKm: 0, durationMin: 0, geometry: [[from.lat, from.lng]], source: 'osrm' });
  }
  const k = `${key(from, 4)}>${key(to, 4)}`;
  const cached = routeCache.get(k);
  if (cached) return cached;

  const url = `${GEO.osrm}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const p = fetchJson<OsrmResponse>(url, { timeoutMs: 7000 })
    .then((data): RouteGeometry => {
      const r = data.routes?.[0];
      if (data.code !== 'Ok' || !r) throw new Error(data.code);
      return {
        distanceKm: Math.round((r.distance / 1000) * 10) / 10,
        durationMin: Math.max(1, Math.round((r.duration / 60) * TRAFFIC_FACTOR)),
        geometry: simplifyPath(r.geometry.coordinates.map(([lng, lat]) => [lat, lng])),
        source: 'osrm',
      };
    })
    .catch(() => {
      routeCache.delete(k); // don't cache failures
      return estimateRoute(from, to);
    });
  routeCache.set(k, p);
  if (routeCache.size > 300) routeCache.delete(routeCache.keys().next().value!);
  return p;
}

/* ======================================================================
   Place search (autocomplete)
   ====================================================================== */
export interface PlaceResult {
  id: string;
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  kind: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id: number;
    osm_type: string;
    osm_value?: string;
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    countrycode?: string;
  };
}

export async function searchPlaces(
  q: string,
  { near, signal, limit = 7, lang = 'uz' }: { near?: GeoPoint; signal?: AbortSignal; limit?: number; lang?: Locale } = {},
): Promise<PlaceResult[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const params = new URLSearchParams({
    q: query,
    // Photon only knows en/de/fr; "default" returns local (Uzbek/Russian) names instead of browser-language ones.
    lang: lang === 'en' ? 'en' : 'default',
    limit: String(limit + 3),
    bbox: `${UZ_BOUNDS.west},${UZ_BOUNDS.south},${UZ_BOUNDS.east},${UZ_BOUNDS.north}`,
  });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  const data = await fetchJson<{ features: PhotonFeature[] }>(`${GEO.photon}/api/?${params}`, { signal, timeoutMs: 6000 });
  const seen = new Set<string>();
  const out: PlaceResult[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (p.countrycode && p.countrycode.toUpperCase() !== 'UZ') continue;
    const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
    const title = p.name || streetLine || p.locality || p.district || p.city || '';
    if (!title) continue;
    const subtitle = unique([p.name ? streetLine : '', p.locality, p.district, p.city ?? p.county, p.city ? '' : p.state].filter(Boolean) as string[])
      .filter((s) => s !== title)
      .join(', ');
    const id = `${p.osm_type}${p.osm_id}`;
    const dedupe = `${title}|${subtitle}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ id, title, subtitle, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: p.osm_value ?? p.type ?? '' });
    if (out.length >= limit) break;
  }
  return out;
}

function unique(arr: string[]) {
  return [...new Set(arr)];
}

/* ======================================================================
   Reverse geocoding (throttled, cached)
   ====================================================================== */
export interface ReverseResult {
  text: string;
  countryCode?: string;
  city?: string;
  district?: string;
}

interface NominatimReverse {
  display_name?: string;
  name?: string;
  address?: Record<string, string>;
  error?: string;
}

const reverseCache = new Map<string, ReverseResult>();
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimCall = 0;

export function coordsText(p: GeoPoint) {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

export async function reverseGeocode(p: GeoPoint, lang: Locale): Promise<ReverseResult> {
  const k = `${lang}:${key(p, 4)}`;
  const hit = reverseCache.get(k);
  if (hit) return hit;

  // Serialize calls so we never exceed 1 request per second.
  const run = nominatimQueue.then(async () => {
    const wait = 1100 - (Date.now() - lastNominatimCall);
    if (wait > 0) await sleep(wait);
    lastNominatimCall = Date.now();
    const url = `${GEO.nominatim}/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&addressdetails=1&accept-language=${lang}`;
    return fetchJson<NominatimReverse>(url, { timeoutMs: 8000 });
  });
  nominatimQueue = run.catch(() => undefined);

  try {
    const data = await run;
    if (data.error || !data.address) return { text: coordsText(p) };
    const a = data.address;
    const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(', ');
    const area = a.residential ?? a.neighbourhood ?? a.quarter ?? a.suburb;
    const district = a.city_district ?? a.district ?? a.county;
    const city = a.city ?? a.town ?? a.village ?? a.hamlet;
    const parts = unique([street || (data.name ?? ''), area ?? '', district ?? '', city ?? '', city ? '' : (a.state ?? '')].filter(Boolean));
    const result: ReverseResult = {
      text: parts.length ? parts.join(', ') : (data.display_name ?? coordsText(p)),
      countryCode: a.country_code,
      city,
      district,
    };
    reverseCache.set(k, result);
    return result;
  } catch {
    return { text: coordsText(p) };
  }
}

/* ======================================================================
   Geometry helpers
   ====================================================================== */
const toRad = (d: number) => (d * Math.PI) / 180;

export function bearing(a: GeoPoint, b: GeoPoint) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const pt = ([lat, lng]: [number, number]): GeoPoint => ({ lat, lng });

export function pathLengthKm(path: [number, number][]) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversineKm(pt(path[i - 1]), pt(path[i]));
  return d;
}

/** Point at `fraction` (0..1) of the path length, with heading. */
export function pointAlong(path: [number, number][], fraction: number): { point: GeoPoint; heading: number; index: number } {
  if (path.length === 1) return { point: pt(path[0]), heading: 0, index: 0 };
  const total = pathLengthKm(path);
  let target = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 1; i < path.length; i++) {
    const a = pt(path[i - 1]);
    const b = pt(path[i]);
    const seg = haversineKm(a, b);
    if (target <= seg || i === path.length - 1) {
      const t = seg ? Math.min(1, target / seg) : 0;
      return { point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, heading: bearing(a, b), index: i };
    }
    target -= seg;
  }
  return { point: pt(path[path.length - 1]), heading: 0, index: path.length - 1 };
}

/** Closest vertex of the path to `p` and the remaining distance from there. */
export function progressOnPath(path: [number, number][], p: GeoPoint) {
  let best = 0;
  let bestD = Infinity;
  path.forEach((v, i) => {
    const d = haversineKm(pt(v), p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const remainingKm = pathLengthKm(path.slice(best)) + bestD;
  const total = pathLengthKm(path) || 1;
  return { index: best, offRouteKm: bestD, remainingKm, progress: Math.min(1, Math.max(0, 1 - remainingKm / total)) };
}

/* ======================================================================
   External navigation apps
   ====================================================================== */
export function navigationLinks(to: GeoPoint, from?: GeoPoint) {
  const f = from ? `${from.lat},${from.lng}` : '';
  return {
    google: `https://www.google.com/maps/dir/?api=1${from ? `&origin=${f}` : ''}&destination=${to.lat},${to.lng}&travelmode=driving`,
    yandex: `https://yandex.uz/maps/?rtext=${f}~${to.lat},${to.lng}&rtt=auto`,
    yandexNavi: `yandexnavi://build_route_on_map?lat_to=${to.lat}&lon_to=${to.lng}${from ? `&lat_from=${from.lat}&lon_from=${from.lng}` : ''}`,
    twoGis: `https://2gis.uz/directions/points/${from ? `${from.lng},${from.lat}` : ''}%7C${to.lng},${to.lat}`,
  };
}
