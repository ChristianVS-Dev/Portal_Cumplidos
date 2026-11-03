/**
 * Persistencia local del dispositivo (web y WebView de Capacitor).
 * No requiere plugin extra: localStorage sobrevive al cierre de la APK.
 */
export function leerJsonDispositivo(clave, fallback = null) {
  try {
    const raw = window.localStorage?.getItem(clave);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function guardarJsonDispositivo(clave, valor) {
  try {
    window.localStorage?.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}
