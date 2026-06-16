import { getApiBaseUrl } from '../platform/config.js';

const BASE = getApiBaseUrl();
const PORTAL_API_KEY = import.meta.env.VITE_PORTAL_API_KEY || '';

function apiHeaders(extra = {}) {
  const headers = { ...extra };
  if (PORTAL_API_KEY) {
    headers['X-Portal-Key'] = PORTAL_API_KEY;
  }
  return headers;
}

export class ApiError extends Error {
  constructor(message, { status, network, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.network = network;
    this.code = code;
  }
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: apiHeaders({
        ...(options.body && !(options.body instanceof FormData) ? jsonHeaders() : {}),
        ...options.headers,
      }),
    });
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Verifique su red o reporte el incidente.',
      { network: true, code: 'NETWORK' }
    );
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(json.error || `Error ${res.status}`, {
      status: res.status,
      code: json.code,
    });
  }

  return json;
}

export async function checkApiHealth() {
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(8000),
      headers: apiHeaders(),
    });
    const debugHealth = import.meta.env.DEV || import.meta.env.MODE === 'mobile';
    if (debugHealth) {
      console.info('[health]', BASE, res.status, res.ok);
    }
    return res.ok;
  } catch (err) {
    const debugHealth = import.meta.env.DEV || import.meta.env.MODE === 'mobile';
    if (debugHealth) {
      console.warn('[health] falló', BASE, err?.message || err);
    }
    return false;
  }
}

export function getConfiguredApiBase() {
  return BASE;
}

/** Consulta transporte (API externa) o SAP legacy */
export async function buscarEntrega(numero) {
  return request(`/entregas/${encodeURIComponent(numero.trim())}`);
}

/** Guarda una visita (1–3) en borrador sin cerrar el cumplido */
export async function registrarVisitaEntrega(numero, payload) {
  return request(`/entregas/${encodeURIComponent(numero.trim())}/visita`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Ítems y cabecera de una entrega (solo API 1) */
export async function obtenerDetalleEntrega(vbeln) {
  return request(`/entregas/${encodeURIComponent(vbeln.trim())}/detalle`);
}

/** Guarda un adjunto en MySQL + disco al seleccionarlo */
export async function subirAdjunto(cumplidoId, file, tipo = 'cumplido') {
  const form = new FormData();
  form.append('archivo', file);
  form.append('tipo', tipo);

  let res;
  try {
    res = await fetch(`${BASE}/cumplidos/${cumplidoId}/adjuntos`, {
      method: 'POST',
      body: form,
      headers: apiHeaders(),
    });
  } catch {
    throw new ApiError('No se pudo guardar el adjunto. Verifique la conexión.', { network: true });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || `Error ${res.status}`, { status: res.status });
  return json;
}

/** Guarda datos del paso 1 en el borrador (fecha, hora, transportista, placa) */
export async function actualizarBorrador(cumplidoId, payload) {
  return request(`/cumplidos/${cumplidoId}/borrador`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Completa el registro del conductor */
export async function completarRegistro(cumplidoId, payload) {
  return request(`/cumplidos/${cumplidoId}/completar`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Flujo todo-en-uno (compatibilidad) */
export async function crearCumplido(payload, archivos = []) {
  const form = new FormData();
  form.append('data', JSON.stringify(payload));
  archivos.forEach((a) => form.append('archivos', a.file));
  if (archivos.length) {
    form.append('tipos', JSON.stringify(archivos.map((a) => a.tipo || 'cumplido')));
  }

  let res;
  try {
    res = await fetch(`${BASE}/cumplidos`, {
      method: 'POST',
      body: form,
      headers: apiHeaders(),
    });
  } catch {
    throw new ApiError('No se pudo conectar al guardar. Sus datos no se enviaron.', { network: true });
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || `Error ${res.status}`, { status: res.status });
  return json;
}
