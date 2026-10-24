import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourierLocation } from '@/types';

export type GeoError = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

interface State {
  position?: CourierLocation;
  error?: GeoError;
  loading: boolean;
}

function toLocation(p: GeolocationPosition): CourierLocation {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: Math.round(p.coords.accuracy),
    heading: p.coords.heading ?? undefined,
    speed: p.coords.speed ?? undefined,
    at: new Date(p.timestamp).toISOString(),
  };
}

function toError(e: GeolocationPositionError): GeoError {
  return e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable';
}

/**
 * Device geolocation. `watch` streams updates (for couriers on a delivery);
 * otherwise a single fix is taken when `enabled` becomes true or `refresh()` is called.
 */
export function useGeolocation({ enabled = true, watch = false }: { enabled?: boolean; watch?: boolean } = {}) {
  const [state, setState] = useState<State>({ loading: false });
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setState({ loading: false, error: 'unsupported' });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const ok = (p: GeolocationPosition) => mounted.current && setState({ position: toLocation(p), loading: false });
    const fail = (e: GeolocationPositionError) => mounted.current && setState((s) => ({ ...s, loading: false, error: toError(e) }));
    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: watch ? 3000 : 30000 };
    if (watch) {
      const id = navigator.geolocation.watchPosition(ok, fail, opts);
      return () => navigator.geolocation.clearWatch(id);
    }
    navigator.geolocation.getCurrentPosition(ok, fail, opts);
  }, [enabled, watch, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refresh };
}
