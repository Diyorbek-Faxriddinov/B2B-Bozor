/**
 * Server-side geo: OSRM road routing with a straight-line fallback, plus the geometry
 * helpers used for live tracking. Port of frontend/src/lib/geo.ts.
 */
import { env } from '../config/env';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteGeometry {
  distanceKm: number;
  durationMin: number;
  source: 'osrm' | 'estimate';
  /** [lat, lng] pairs, simplified. */
  geometry: [number, number][];
}

export const UZ_BOUNDS = { south: 37.1, west: 55.9, north: 45.6, east: 73.2 };
const ROAD_FACTOR = 1.3;
const AVG_SPEED_KMH = 28;
/** OSRM ignores traffic; Tashkent rush hours are slower. */
const TRAFFIC_FACTOR = 1.25;

export function inUzbekistan(p: GeoPoint) {
  return p.lat >= UZ_BOUNDS.south && p.lat <= UZ_BOUNDS.north && p.lng >= UZ_BOUNDS.west && p.lng <= UZ_BOUNDS.east;
}

export function haversineKm(a: GeoPoint, b: GeoPoint) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

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

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

const routeCache = new Map<string, Promise<RouteGeometry>>();
const key = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

/** Fastest driving route. Never throws — falls back to a straight-line estimate. */
export function getRoute(from: GeoPoint, to: GeoPoint): Promise<RouteGeometry> {
  if (haversineKm(from, to) < 0.02) {
    return Promise.resolve({ distanceKm: 0, durationMin: 0, geometry: [[from.lat, from.lng]], source: 'osrm' });
  }
  const base = env().OSRM_URL.replace(/\/$/, '');
  if (!base || base === 'off') return Promise.resolve(estimateRoute(from, to));

  const k = `${key(from)}>${key(to)}`;
  const cached = routeCache.get(k);
  if (cached) return cached;

  const url = `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const p = fetch(url, { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json', 'User-Agent': 'b2b-bozor-api/1.0' } })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as OsrmResponse;
      const r = data.routes?.[0];
      if (data.code !== 'Ok' || !r) throw new Error(data.code);
      return {
        distanceKm: Math.round((r.distance / 1000) * 10) / 10,
        durationMin: Math.max(1, Math.round((r.duration / 60) * TRAFFIC_FACTOR)),
        geometry: simplifyPath(r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])),
        source: 'osrm' as const,
      };
    })
    .catch(() => {
      routeCache.delete(k); // don't cache failures
      return estimateRoute(from, to);
    });
  routeCache.set(k, p);
  if (routeCache.size > 1000) routeCache.delete(routeCache.keys().next().value!);
  return p;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const pt = ([lat, lng]: [number, number]): GeoPoint => ({ lat, lng });

export function bearing(a: GeoPoint, b: GeoPoint) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function pathLengthKm(path: [number, number][]) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversineKm(pt(path[i - 1]), pt(path[i]));
  return d;
}

/** Point at `fraction` (0..1) of the path length, with heading. */
export function pointAlong(path: [number, number][], fraction: number): { point: GeoPoint; heading: number } {
  if (path.length === 1) return { point: pt(path[0]), heading: 0 };
  let target = Math.min(1, Math.max(0, fraction)) * pathLengthKm(path);
  for (let i = 1; i < path.length; i++) {
    const a = pt(path[i - 1]);
    const b = pt(path[i]);
    const seg = haversineKm(a, b);
    if (target <= seg || i === path.length - 1) {
      const t = seg ? Math.min(1, target / seg) : 0;
      return { point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, heading: bearing(a, b) };
    }
    target -= seg;
  }
  return { point: pt(path[path.length - 1]), heading: 0 };
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
  return { remainingKm, progress: Math.min(1, Math.max(0, 1 - remainingKm / total)) };
}
