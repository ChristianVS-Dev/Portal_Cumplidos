import { useCallback, useEffect, useState } from 'react';
import PortalPage from './pages/PortalPage.jsx';
import PortalEmpresa from './pages/PortalEmpresa.jsx';
import NativeShell from './components/NativeShell.jsx';
import LoginConductor from './components/LoginConductor.jsx';
import { isNativeApp } from './platform/config.js';
import { consumirTokenConfirmar, consumirTokenRestablecer } from './lib/restablecer-url.js';
import { ApiError, obtenerSesionConductor, salirConductor } from './api/client.js';

const TOKEN_RESTABLECER = consumirTokenRestablecer();
const TOKEN_CONFIRMAR = consumirTokenConfirmar();

function PortalAutenticado() {
  const [acceso, setAcceso] = useState(null);
  const [listo, setListo] = useState(false);
  const [avisoRed, setAvisoRed] = useState('');
  const [tokenReset, setTokenReset] = useState(TOKEN_RESTABLECER);
  const [tokenConfirmar, setTokenConfirmar] = useState(TOKEN_CONFIRMAR);

  const cargarSesion = useCallback(async () => {
    try {
      const res = await obtenerSesionConductor();
      setAcceso(res.data);
      setAvisoRed('');
    } catch (err) {
      setAcceso(null);
      if (err instanceof ApiError && err.status === 401) setAvisoRed('');
      else setAvisoRed(err.message || 'No se pudo verificar la sesión');
    } finally {
      setListo(true);
    }
  }, []);

  useEffect(() => {
    cargarSesion();
  }, [cargarSesion]);

  const onSalir = async () => {
    await salirConductor();
    setAcceso(null);
  };

  const onRestablecido = useCallback(() => {
    setTokenReset('');
    setAcceso(null);
  }, []);

  const onConfirmado = useCallback(() => {
    setTokenConfirmar('');
    setAcceso(null);
  }, []);

  if (!listo) {
    return (
      <div className="acceso-root acceso-root--espera">
        <p>Cargando sesión...</p>
      </div>
    );
  }

  if (!acceso || tokenReset || tokenConfirmar) {
    return (
      <LoginConductor
        avisoRed={avisoRed}
        tokenRestablecer={tokenReset}
        tokenConfirmar={tokenConfirmar}
        onAutenticado={(data) => {
          setTokenReset('');
          setTokenConfirmar('');
          setAvisoRed('');
          setAcceso(data);
        }}
        onRestablecido={onRestablecido}
        onConfirmado={onConfirmado}
      />
    );
  }

  if (acceso.conductor?.tipo === 'empresa') {
    return <PortalEmpresa acceso={acceso} onSalir={onSalir} />;
  }

  return <PortalPage acceso={acceso} onSalir={onSalir} onAcceso={setAcceso} />;
}

export default function App() {
  const onAndroidBack = useCallback(() => false, []);

  const onResume = useCallback(() => {
    window.dispatchEvent(new CustomEvent('portal:resume'));
  }, []);

  const app = <PortalAutenticado />;

  if (!isNativeApp()) return app;

  return (
    <NativeShell onAndroidBack={onAndroidBack} onResume={onResume}>
      {app}
    </NativeShell>
  );
}
