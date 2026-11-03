import { useCallback, useEffect, useState } from 'react';
import { checkApiHealth } from '../api/client.js';
import { getDeviceOnline, subscribeNetworkStatus } from '../platform/network.js';

const API_POLL_MS = 30_000;

/**
 * Conectividad en dos capas (arquitectura cercana a nativo):
 * 1) red del dispositivo (Capacitor Network / navigator.onLine)
 * 2) API alcanzable (health check)
 */
export function useAppConnectivity() {
  const [deviceOnline, setDeviceOnline] = useState(true);
  const [apiReachable, setApiReachable] = useState(true);

  const refreshApi = useCallback(async () => {
    const online = await getDeviceOnline();
    setDeviceOnline(online);
    if (!online) {
      setApiReachable(false);
      return false;
    }
    const ok = await checkApiHealth();
    setApiReachable(ok);
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubNetwork = () => {};

    (async () => {
      if (!cancelled) await refreshApi();
      unsubNetwork = subscribeNetworkStatus(() => {
        if (!cancelled) refreshApi();
      });
    })();

    const interval = setInterval(() => {
      if (!cancelled) refreshApi();
    }, API_POLL_MS);

    return () => {
      cancelled = true;
      unsubNetwork();
      clearInterval(interval);
    };
  }, [refreshApi]);

  /** Tras una llamada API exitosa (evita esperar al próximo health poll) */
  const markApiOnline = useCallback(() => {
    setApiReachable(true);
  }, []);

  /** Tras error de red en una operación del portal */
  const markApiOffline = useCallback(() => {
    setApiReachable(false);
  }, []);

  return {
    /** Compatibilidad con UI existente: requiere red + API */
    apiOnline: deviceOnline && apiReachable,
    deviceOnline,
    apiReachable,
    refreshConnectivity: refreshApi,
    markApiOnline,
    markApiOffline,
  };
}
