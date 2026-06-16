import { useCallback } from 'react';
import PortalPage from './pages/PortalPage.jsx';
import NativeShell from './components/NativeShell.jsx';
import { isNativeApp } from './platform/config.js';

export default function App() {
  const onAndroidBack = useCallback(() => false, []);

  const onResume = useCallback(() => {
    window.dispatchEvent(new CustomEvent('portal:resume'));
  }, []);

  const app = <PortalPage />;

  if (!isNativeApp()) return app;

  return (
    <NativeShell onAndroidBack={onAndroidBack} onResume={onResume}>
      {app}
    </NativeShell>
  );
}
