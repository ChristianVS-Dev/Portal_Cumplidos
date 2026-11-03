import { Capacitor } from '@capacitor/core';

/** true cuando la UI corre dentro del WebView de Capacitor (Android/iOS) */
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function getPlatform() {
  return Capacitor.getPlatform();
}

/**
 * URL base del API.
 * - Web (Docker/nginx): /api/v1 (proxy relativo)
 * - App móvil: URL absoluta HTTPS (VITE_API_URL en .env.mobile)
 */
export function getApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  if (isNativeApp()) {
    console.warn(
      '[platform] VITE_API_URL no definida en build móvil. Configure .env.mobile antes de cap sync.'
    );
  }
  return '/api/v1';
}

export function getAppMeta() {
  return {
    native: isNativeApp(),
    platform: getPlatform(),
    apiBase: getApiBaseUrl(),
    buildMode: import.meta.env.MODE,
  };
}
