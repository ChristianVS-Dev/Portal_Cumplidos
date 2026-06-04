import { config } from '../config/index.js';

function buildAuthHeaderValue() {
  const { token, tokenPrefix } = config.entregasExterna;
  if (!token) return null;
  return tokenPrefix ? `${tokenPrefix} ${token}`.trim() : token;
}

/** Cabecera Authorization (o personalizada) con el token de la API de entregas */
export function entregasApiAuthHeaders() {
  const { tokenHeader } = config.entregasExterna;
  const value = buildAuthHeaderValue();
  if (!value) return {};
  return { [tokenHeader]: value };
}

/** Token en GET consulta entrega/transporte (activo por defecto) */
export function entregasApiReadHeaders() {
  if (!config.entregasExterna.sendTokenOnRead) return {};
  return entregasApiAuthHeaders();
}

export function tieneTokenEntregasApi() {
  return Boolean(config.entregasExterna.token);
}

export function urlAdjuntosEntrega(numeroEntrega) {
  const base = config.entregasExterna.baseUrl.replace(/\/$/, '');
  const n = encodeURIComponent(String(numeroEntrega).trim());
  return `${base}/${n}/adjuntos`;
}

/** Mensaje más claro cuando la API externa responde 401 */
export function mensajeError401Entregas(status, json) {
  const base = json?.message || json?.error || json?.mensaje || `API respondió ${status}`;
  if (status !== 401) return base;
  const { token, sendTokenOnRead } = config.entregasExterna;
  if (!token) {
    return (
      `${base}. Configure PORTAL_API_KEY o ENTREGAS_API_TOKEN en .env.docker (mismo valor que entregó TI) ` +
      'y reinicie la API (docker:api:restart).'
    );
  }
  if (!sendTokenOnRead) {
    return (
      `${base}. El token está configurado pero ENTREGAS_API_SEND_TOKEN_ON_READ=false. ` +
      'Póngalo en true (o elimine la variable) y reinicie la API.'
    );
  }
  return (
    `${base}. Verifique PORTAL_API_KEY/ENTREGAS_API_TOKEN y el header ` +
    `(${config.entregasExterna.tokenHeader}, prefijo "${config.entregasExterna.tokenPrefix || ''}").`
  );
}
