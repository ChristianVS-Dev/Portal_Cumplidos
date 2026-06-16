import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { getAppMeta } from './platform/config.js';
import './styles/portal.css';

if (import.meta.env.DEV) {
  console.info('[Portal Cumplidos]', getAppMeta());
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
