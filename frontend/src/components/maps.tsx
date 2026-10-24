import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { Clock, Crosshair, Layers, Loader2, MapPin, Maximize2, Minimize2, Route as RouteIcon, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Address, CourierLocation, GeoPoint, RouteGeometry } from '@/types';
import { TASHKENT_CENTER } from '@/lib/constants';
import { cn, debounce } from '@/lib/utils';
import { getRoute, inUzbekistan, reverseGeocode, searchPlaces, UZ_LEAFLET_BOUNDS, type PlaceResult } from '@/lib/geo';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useLocale, useT } from '@/i18n';
import { Button } from './ui/button';

/* ======================================================================
   Tiles & icons
   ====================================================================== */
const LAYERS = {
  map: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
} as const;
const SAT_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
type LayerKey = keyof typeof LAYERS;

function pin(color: string) {
  return L.divIcon({
    className: 'map-pin',
    iconSize: [32, 42],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
    tooltipAnchor: [0, -34],
    html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 41s13-12.6 13-24A13 13 0 0 0 3 17c0 11.4 13 24 13 24z" fill="${color}" stroke="white" stroke-width="2.5"/>
      <circle cx="16" cy="17" r="5.5" fill="white"/></svg>`,
  });
}

export const pins = {
  primary: pin('#1d4ed8'),
  warehouse: pin('#ea580c'),
  destination: pin('#16a34a'),
  muted: pin('#64748b'),
  me: L.divIcon({
    className: 'map-pin',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: '<span class="map-me-dot"></span>',
  }),
};

export function courierIcon(heading?: number) {
  const arrow =
    heading !== undefined
      ? `<svg class="map-courier-arrow" style="transform:rotate(${heading}deg)" width="44" height="44" viewBox="0 0 44 44"><path d="M22 1 L27 9 L17 9 Z" fill="#1d4ed8" stroke="white" stroke-width="1.5"/></svg>`
      : '';
  return L.divIcon({
    className: 'map-pin',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -18],
    html: `<div class="map-courier">${arrow}<span class="map-courier-body"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span></div>`,
  });
}

/* ======================================================================
   Map shell: layers, fullscreen, fit helpers
   ====================================================================== */
function InvalidateOnResize({ trigger }: { trigger: unknown }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize({ animate: false }), 60);
    return () => clearTimeout(id);
  }, [trigger, map]);
  return null;
}

export function FitBounds({ points, padding = 48, maxZoom = 16 }: { points: GeoPoint[]; padding?: number; maxZoom?: number }) {
  const map = useMap();
  const sig = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  const done = useRef('');
  useEffect(() => {
    if (!points.length || done.current === sig) return;
    done.current = sig;
    // No animation: an in-flight zoom animation crashes Leaflet if the map unmounts mid-way.
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], Math.min(maxZoom, 15), { animate: false });
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [padding, padding], maxZoom, animate: false });
  }, [sig, map, points, padding, maxZoom]);
  return null;
}

export function MapShell({
  center = TASHKENT_CENTER,
  zoom = 12,
  className,
  children,
  overlay,
  scrollWheelZoom = true,
  restrictToUz = true,
}: {
  center?: GeoPoint;
  zoom?: number;
  className?: string;
  children?: ReactNode;
  /** Absolutely-positioned UI rendered above the map (search bars, chips). */
  overlay?: ReactNode;
  scrollWheelZoom?: boolean;
  restrictToUz?: boolean;
}) {
  const t = useT();
  const [layer, setLayer] = useState<LayerKey>('map');
  const [full, setFull] = useState(false);
  const cfg = LAYERS[layer];

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  return (
    <div className={cn('relative isolate overflow-hidden rounded-xl border border-border bg-surface-2', full && 'fixed! inset-0 z-[1100] h-auto! rounded-none border-0', layer === 'satellite' && 'map-satellite', className)}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className="h-full min-h-64 w-full"
        scrollWheelZoom={scrollWheelZoom || full}
        maxBounds={restrictToUz ? UZ_LEAFLET_BOUNDS : undefined}
        maxBoundsViscosity={restrictToUz ? 0.8 : undefined}
        minZoom={restrictToUz ? 6 : undefined}
        zoomControl={false}
        attributionControl
      >
        <TileLayer key={layer} url={cfg.url} attribution={cfg.attribution} maxZoom={cfg.maxZoom} />
        {layer === 'satellite' && <TileLayer url={SAT_LABELS} maxZoom={19} />}
        <ZoomButtons />
        <InvalidateOnResize trigger={full} />
        {children}
      </MapContainer>
      {overlay}
      <div className="absolute right-3 bottom-8 z-[500] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setLayer((l) => (l === 'map' ? 'satellite' : 'map'))}
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-fg shadow-(--shadow-pop) hover:bg-surface-2"
          title={layer === 'map' ? t('map.satellite') : t('map.scheme')}
          aria-label={layer === 'map' ? t('map.satellite') : t('map.scheme')}
        >
          <Layers className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-fg shadow-(--shadow-pop) hover:bg-surface-2"
          title={full ? t('map.exitFullscreen') : t('map.fullscreen')}
          aria-label={full ? t('map.exitFullscreen') : t('map.fullscreen')}
        >
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function ZoomButtons() {
  const map = useMap();
  const btn = 'flex size-9 items-center justify-center border-border bg-surface text-lg font-semibold text-fg hover:bg-surface-2';
  return (
    <div className="leaflet-top leaflet-left" style={{ pointerEvents: 'none' }}>
      <div className="mt-3 ml-3 flex flex-col overflow-hidden rounded-lg border border-border shadow-(--shadow-pop)" style={{ pointerEvents: 'auto' }}>
        <button type="button" className={cn(btn, 'border-b')} onClick={() => map.zoomIn()} aria-label="Zoom in">
          +
        </button>
        <button type="button" className={btn} onClick={() => map.zoomOut()} aria-label="Zoom out">
          −
        </button>
      </div>
    </div>
  );
}

/* ======================================================================
   Location picker (search + click/drag + GPS)
   ====================================================================== */
function ClickHandler({ onPick }: { onPick: (p: GeoPoint) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ target }: { target: (GeoPoint & { zoom?: number; nonce: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 16), { duration: 0.7 });
  }, [target, map]);
  return null;
}

export function LocationPicker({ value, onChange, className, near }: { value?: Address; onChange: (a: Address) => void; className?: string; near?: GeoPoint }) {
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [fly, setFly] = useState<(GeoPoint & { zoom?: number; nonce: number }) | null>(null);
  const [locate, setLocate] = useState(false);
  const geo = useGeolocation({ enabled: locate });
  const abortRef = useRef<AbortController | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const pick = async (p: GeoPoint, presetText?: string) => {
    if (!inUzbekistan(p)) {
      toast.error(t('map.outsideUz'));
      return;
    }
    const base = { ...valueRef.current, lat: p.lat, lng: p.lng };
    if (presetText) {
      onChange({ ...base, text: presetText });
      return;
    }
    onChange({ ...base, text: t('map.resolving') });
    setResolving(true);
    const r = await reverseGeocode(p, locale);
    setResolving(false);
    // ignore stale responses if the user picked another point meanwhile
    const cur = valueRef.current;
    if (cur && Math.abs(cur.lat - p.lat) < 1e-9 && Math.abs(cur.lng - p.lng) < 1e-9) onChange({ ...cur, text: r.text });
  };

  const runSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        abortRef.current?.abort();
        if (q.trim().length < 3) {
          setResults([]);
          setSearching(false);
          return;
        }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setSearching(true);
        try {
          const r = await searchPlaces(q, { near: valueRef.current ?? near ?? TASHKENT_CENTER, signal: ctrl.signal, lang: locale });
          if (!ctrl.signal.aborted) {
            setResults(r);
            setActive(r.length ? 0 : -1);
            setOpen(true);
          }
        } catch {
          if (!ctrl.signal.aborted) setResults([]);
        } finally {
          if (!ctrl.signal.aborted) setSearching(false);
        }
      }, 300),
    [near, locale],
  );

  // GPS result
  useEffect(() => {
    if (!locate) return;
    if (geo.position) {
      setLocate(false);
      setFly({ ...geo.position, zoom: 17, nonce: Date.now() });
      pick(geo.position);
    } else if (geo.error) {
      setLocate(false);
      toast.error(geo.error === 'denied' ? t('map.geoDenied') : geo.error === 'unsupported' ? t('map.geoUnsupported') : t('map.geoFailed'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position, geo.error, locate]);

  const choose = (r: PlaceResult) => {
    setOpen(false);
    setResults([]);
    setQuery('');
    setFly({ lat: r.lat, lng: r.lng, zoom: 17, nonce: Date.now() });
    pick({ lat: r.lat, lng: r.lng }, [r.title, r.subtitle].filter(Boolean).join(', '));
  };

  const center = value ?? near ?? TASHKENT_CENTER;

  return (
    <MapShell
      center={center}
      zoom={value ? 16 : 12}
      className={className}
      overlay={
        <>
          <div className="absolute top-3 right-3 left-16 z-[600] flex gap-2">
            <div className="relative flex-1">
              <div className="flex h-10 items-center rounded-lg border border-border-strong bg-surface pl-3 shadow-(--shadow-pop) focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
                {searching ? <Loader2 className="size-4 shrink-0 animate-spin text-fg-subtle" /> : <Search className="size-4 shrink-0 text-fg-subtle" />}
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    runSearch(e.target.value);
                  }}
                  onFocus={() => results.length && setOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActive((a) => Math.min(results.length - 1, a + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActive((a) => Math.max(0, a - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (results[active]) choose(results[active]);
                    } else if (e.key === 'Escape') setOpen(false);
                  }}
                  placeholder={t('map.searchPlaceholder')}
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
                  aria-label={t('map.searchPlaceholder')}
                  role="combobox"
                  aria-expanded={open}
                  aria-autocomplete="list"
                />
                {query && (
                  <button
                    type="button"
                    className="mr-1 rounded p-1.5 text-fg-subtle hover:text-fg"
                    onClick={() => {
                      setQuery('');
                      setResults([]);
                    }}
                    aria-label={t('common.clear')}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {open && query.trim().length >= 3 && !searching && (
                <ul role="listbox" className="absolute top-full right-0 left-0 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-surface p-1 shadow-(--shadow-pop)">
                  {!results.length && <li className="px-3 py-3 text-sm text-fg-muted">{t('map.noResults')}</li>}
                  {results.map((r, i) => (
                    <li key={r.id} role="option" aria-selected={i === active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(r)}
                        className={cn('flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left', i === active ? 'bg-surface-2' : '')}
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-fg">{r.title}</span>
                          {r.subtitle && <span className="block truncate text-xs text-fg-subtle">{r.subtitle}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                  <li className="px-2.5 pt-1 pb-0.5 text-right text-[10px] text-fg-subtle">Photon · OpenStreetMap</li>
                </ul>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setLocate(true)}
              loading={locate}
              className="shadow-(--shadow-pop)"
              aria-label={t('map.myLocation')}
              title={t('map.myLocation')}
            >
              {!locate && <Crosshair />}
            </Button>
          </div>
          {!value && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-fg/85 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-bg">
              {t('map.clickToPick')}
            </div>
          )}
          {resolving && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-medium shadow-(--shadow-pop)">
              <Loader2 className="size-3.5 animate-spin" /> {t('map.resolving')}
            </div>
          )}
        </>
      }
    >
      <ClickHandler onPick={(p) => pick(p)} />
      <FlyTo target={fly} />
      {geo.position && geo.position.accuracy && geo.position.accuracy < 2000 && (
        <Circle center={[geo.position.lat, geo.position.lng]} radius={geo.position.accuracy} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }} />
      )}
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          icon={pins.primary}
          draggable
          autoPan
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              pick({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
    </MapShell>
  );
}

/* ======================================================================
   Route rendering
   ====================================================================== */
export function useRoute(from?: GeoPoint, to?: GeoPoint) {
  return useQuery({
    queryKey: ['route', from?.lat, from?.lng, to?.lat, to?.lng],
    queryFn: () => getRoute(from!, to!),
    enabled: !!from && !!to,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}

export function RoutePolyline({ route, color = '#1d4ed8', muted }: { route: Pick<RouteGeometry, 'geometry' | 'source'>; color?: string; muted?: boolean }) {
  if (route.geometry.length < 2) return null;
  const dashed = route.source === 'estimate';
  return (
    <>
      <Polyline positions={route.geometry} pathOptions={{ color: '#ffffff', weight: muted ? 6 : 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline
        positions={route.geometry}
        pathOptions={{ color: muted ? '#94a3b8' : color, weight: muted ? 3.5 : 5, opacity: 0.95, dashArray: dashed ? '8 10' : undefined, lineCap: 'round', lineJoin: 'round' }}
      />
    </>
  );
}

export function RouteChip({ route, loading, label }: { route?: Pick<RouteGeometry, 'distanceKm' | 'durationMin' | 'source'>; loading?: boolean; label?: string }) {
  const t = useT();
  if (loading)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface/95 px-3 py-1.5 text-xs font-semibold text-fg shadow-(--shadow-pop)">
        <Loader2 className="size-3.5 animate-spin" /> {t('map.routing')}
      </span>
    );
  if (!route) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-surface/95 px-3 py-1.5 text-xs font-semibold text-fg shadow-(--shadow-pop)">
      {label && <span className="text-fg-muted">{label}</span>}
      <span className="inline-flex items-center gap-1">
        <RouteIcon className="size-3.5 text-primary" /> {route.distanceKm} km
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5 text-primary" /> ~{formatMinutes(route.durationMin, t)}
      </span>
      {route.source === 'estimate' && <span className="font-medium text-warning">{t('map.estimate')}</span>}
    </span>
  );
}

export function formatMinutes(min: number, t: ReturnType<typeof useT>) {
  if (min < 60) return t('map.min', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t('map.hMin', { h, m }) : t('map.h', { h });
}

/**
 * Pickup → destination overview with the real road route.
 * Pass `courier` to show a live vehicle marker; pass `route` to reuse an already computed geometry.
 */
export function RouteMap({
  from,
  to,
  courier,
  route: routeProp,
  me,
  className,
  fromLabel,
  toLabel,
  hideFrom,
  toKind = 'destination',
}: {
  from: GeoPoint & { text?: string };
  to?: GeoPoint & { text?: string };
  courier?: CourierLocation & { source?: string };
  route?: RouteGeometry;
  me?: GeoPoint;
  className?: string;
  fromLabel?: string;
  toLabel?: string;
  /** Hide the start pin (e.g. when the start is the courier marker itself). */
  hideFrom?: boolean;
  toKind?: 'destination' | 'warehouse';
}) {
  const t = useT();
  const fetched = useRoute(routeProp ? undefined : from, routeProp ? undefined : to);
  const route = routeProp ?? fetched.data;
  const fitPoints = useMemo(() => {
    const pts: GeoPoint[] = [from];
    if (to) pts.push(to);
    if (courier) pts.push(courier);
    return pts;
    // fit only on endpoints change, not on every courier tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.lat, from.lng, to?.lat, to?.lng, !!courier]);

  return (
    <MapShell
      center={from}
      zoom={13}
      scrollWheelZoom={false}
      className={className}
      overlay={
        to && (
          <div className="absolute bottom-3 left-3 z-[500] max-w-[calc(100%-5rem)]">
            <RouteChip route={route} loading={!route && fetched.isFetching} />
          </div>
        )
      }
    >
      <FitBounds points={fitPoints} />
      {route && <RoutePolyline route={route} />}
      {!hideFrom && (
      <Marker position={[from.lat, from.lng]} icon={pins.warehouse}>
        <Popup>
          <b>{fromLabel ?? t('map.pickup')}</b>
          {from.text && (
            <>
              <br />
              {from.text}
            </>
          )}
        </Popup>
      </Marker>
      )}
      {to && (
        <Marker position={[to.lat, to.lng]} icon={pins[toKind]}>
          <Popup>
            <b>{toLabel ?? t('map.destination')}</b>
            {to.text && (
              <>
                <br />
                {to.text}
              </>
            )}
          </Popup>
        </Marker>
      )}
      {me && <Marker position={[me.lat, me.lng]} icon={pins.me} />}
      {courier && (
        <Marker position={[courier.lat, courier.lng]} icon={courierIcon(courier.heading)} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -20]}>
            {t('map.courierHere')}
          </Tooltip>
        </Marker>
      )}
    </MapShell>
  );
}

/* ======================================================================
   Multiple points (courier job board, pickup points)
   ====================================================================== */
export interface MapPoint extends GeoPoint {
  id: string;
  kind: 'warehouse' | 'destination' | 'primary' | 'muted';
  title: string;
  subtitle?: string;
}

export function PointsMap({
  points,
  me,
  selectedId,
  onSelect,
  routes,
  className,
}: {
  points: MapPoint[];
  me?: GeoPoint & { accuracy?: number };
  selectedId?: string;
  onSelect?: (id: string) => void;
  routes?: RouteGeometry[];
  className?: string;
}) {
  const fit = useMemo(() => [...points, ...(me ? [me] : [])], [points, me]);
  return (
    <MapShell center={points[0] ?? me ?? TASHKENT_CENTER} zoom={12} className={className} scrollWheelZoom={false}>
      <FitBounds points={fit} />
      {routes?.map((r, i) => <RoutePolyline key={i} route={r} muted={i > 0} />)}
      {points.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={p.id === selectedId ? pins.primary : pins[p.kind]}
          zIndexOffset={p.id === selectedId ? 500 : 0}
          eventHandlers={{ click: () => onSelect?.(p.id) }}
        >
          <Tooltip direction="top">
            <b>{p.title}</b>
            {p.subtitle && (
              <>
                <br />
                {p.subtitle}
              </>
            )}
          </Tooltip>
        </Marker>
      ))}
      {me && (
        <>
          {me.accuracy && me.accuracy < 2000 && <Circle center={[me.lat, me.lng]} radius={me.accuracy} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }} />}
          <Marker position={[me.lat, me.lng]} icon={pins.me} />
        </>
      )}
    </MapShell>
  );
}

export function PointMap({ point, label, className }: { point: GeoPoint; label?: string; className?: string }) {
  return (
    <MapShell center={point} zoom={16} className={className} scrollWheelZoom={false}>
      <Marker position={[point.lat, point.lng]} icon={pins.primary}>
        {label && <Popup>{label}</Popup>}
      </Marker>
    </MapShell>
  );
}
