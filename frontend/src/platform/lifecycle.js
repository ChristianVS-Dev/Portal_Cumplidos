import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

async function configureChromeNativo() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#263238' });
  } catch {
    /* plugins opcionales en emuladores antiguos */
  }

  try {
    await SplashScreen.hide({ fadeOutDuration: 280 });
  } catch {
    /* splash ya oculto */
  }
}

/**
 * Inicialización única al arrancar la app nativa (status bar, splash).
 */
export async function initNativeShell() {
  await configureChromeNativo();
}

/**
 * Botón atrás de Android: minimiza en lugar de cerrar abruptamente.
 * @returns {() => void}
 */
export function bindAndroidBackButton(onBack) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => {};
  }

  const sub = App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) return;
    if (onBack) {
      const handled = onBack();
      if (handled) return;
    }
    App.minimizeApp();
  });

  return () => {
    sub.then((h) => h.remove());
  };
}

/** Pausa / reanudación (útil para refrescar datos al volver a primer plano) */
export function bindAppState(onResume) {
  if (!Capacitor.isNativePlatform()) return () => {};

  const sub = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive && onResume) onResume();
  });

  return () => {
    sub.then((h) => h.remove());
  };
}
