import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

/** Estado de red del dispositivo (Wi‑Fi / datos). En web usa navigator.onLine. */
export async function getDeviceOnline() {
  if (!Capacitor.isNativePlatform()) {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
  const status = await Network.getStatus();
  return status.connected;
}

/**
 * Suscripción a cambios de conectividad del dispositivo.
 * @returns {() => void} función para cancelar la suscripción
 */
export function subscribeNetworkStatus(onChange) {
  if (!Capacitor.isNativePlatform()) {
    const handler = () => onChange(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }

  const handle = Network.addListener('networkStatusChange', (status) => {
    onChange(status.connected);
  });

  return () => {
    handle.then((h) => h.remove());
  };
}
