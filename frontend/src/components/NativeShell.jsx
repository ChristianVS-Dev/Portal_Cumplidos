import { useEffect } from 'react';
import { bindAndroidBackButton, bindAppState, initNativeShell } from '../platform/lifecycle.js';
import { isNativeApp } from '../platform/config.js';

/**
 * Envoltorio nativo: chrome del sistema, botón atrás y reanudación.
 * No altera la UI web; solo comportamiento de plataforma.
 */
export default function NativeShell({ children, onResume, onAndroidBack }) {
  useEffect(() => {
    if (!isNativeApp()) return undefined;

    initNativeShell();

    const unbindBack = bindAndroidBackButton(onAndroidBack);
    const unbindState = bindAppState(onResume);

    return () => {
      unbindBack();
      unbindState();
    };
  }, [onResume, onAndroidBack]);

  return children;
}
