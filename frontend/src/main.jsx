import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { getAppMeta, getPlatform, isNativeApp } from './platform/config.js';
import './styles/portal.css';

if (isNativeApp()) {
  const root = document.documentElement;
  root.classList.add('native-app', `platform-${getPlatform()}`);
}

if (import.meta.env.DEV) {
  console.info('[Portal Cumplidos]', getAppMeta());
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
