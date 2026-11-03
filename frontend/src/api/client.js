import { getApiBaseUrl } from '../platform/config.js';

const BASE = getApiBaseUrl();

if (typeof window !== 'undefined') {
  try {
    window.localStorage?.removeItem('portal_cumplidos.sesion');
  } catch {
    /* el navegador puede bloquear el almacenamiento */
  }
}

function apiHeaders(extra = {}) {
  return { ...extra };
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
      credentials: 'include',
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
    const sinDetalle = !json.error && res.status >= 500;
    throw new ApiError(
      sinDetalle
        ? 'No se pudo conectar con el servidor. Verifique su red o reporte el incidente.'
        : json.error || `Error ${res.status}`,
      {
        status: res.status,
        code: json.code,
        network: sinDetalle,
      }
    );
  }

  return json;
}

export async function checkApiHealth() {
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(8000),
      // Sin X-Portal-Key: /health no lo exige y evita preflight CORS innecesario
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
/** Ruta desde la posición del celular hasta la dirección de SAP. */
export async function consultarRutaEntrega(numero, origen) {
  const params = new URLSearchParams();
  if (origen && Number.isFinite(origen.lat) && Number.isFinite(origen.lng)) {
    params.set('lat', String(origen.lat));
    params.set('lng', String(origen.lng));
  }
  const consulta = params.toString();
  return request(`/entregas/${encodeURIComponent(String(numero).trim())}/ruta${consulta ? `?${consulta}` : ''}`);
}

export async function obtenerDetalleEntrega(vbeln) {
  return request(`/entregas/${encodeURIComponent(vbeln.trim())}/detalle`);
}

export async function listarAdjuntosEntrega(vbeln) {
  return request(`/entregas/${encodeURIComponent(String(vbeln).trim())}/adjuntos`);
}

export function urlAdjuntoEntrega(vbeln, docId, ver = false) {
  const base = `${BASE}/entregas/${encodeURIComponent(String(vbeln).trim())}/adjuntos/${encodeURIComponent(docId)}`;
  return ver ? `${base}?ver=1` : base;
}

/** Envía un ZIP adicional a SAP, con observación, sin registrar otro intento. */
export async function reemplazarAdjuntosEntrega(numero, archivos, observacion, copias = []) {
  const form = new FormData();
  for (const archivo of archivos) form.append('archivos', archivo);
  form.append('observacion', observacion);
  const lista = (Array.isArray(copias) ? copias : [copias]).map((correo) => String(correo || '').trim()).filter(Boolean);
  for (const correo of lista) form.append('copia', correo);
  let res;
  try {
    res = await fetch(`${BASE}/entregas/${encodeURIComponent(String(numero).trim())}/adjuntos`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: apiHeaders(),
    });
  } catch {
    throw new ApiError('No se pudo enviar el adjunto. Verifique la conexión.', { network: true });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || `Error ${res.status}`, { status: res.status });
  return json;
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
      credentials: 'include',
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

export async function ingresarConductor({ cedula, placa, password, esContacto, tipo }) {
  return request('/auth/ingreso', {
    method: 'POST',
    body: JSON.stringify({ cedula, placa, password, esContacto, tipo }),
  });
}

export async function registrarConductor(payload) {
  return request('/auth/registro', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function recuperarContrasena({ cedula, placa, tipo }) {
  return request('/auth/recuperar', {
    method: 'POST',
    body: JSON.stringify({ cedula, placa, tipo }),
  });
}

export async function restablecerContrasena({ token, password }) {
  return request('/auth/restablecer', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function confirmarCorreo({ token }) {
  return request('/auth/confirmar', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function reenviarConfirmacionCorreo({ cedula, placa, tipo }) {
  return request('/auth/confirmar/reenviar', {
    method: 'POST',
    body: JSON.stringify({ cedula, placa, tipo }),
  });
}

const CACHE_LISTA_EMPRESA_MS = 90_000;
const VISTAS_EMPRESA = ['dia', 'pendientes', 'programadas', 'todas'];
const listasEmpresa = new Map();
const vuelosListaEmpresa = new Map();
let colaVistasEmpresa = Promise.resolve();
let generacionListaEmpresa = 0;

function claveListaEmpresa(params) {
  return ['fecha', 'vista', 'pagina', 'limite', 'dias']
    .map((clave) => params?.[clave] ?? '')
    .join('|');
}

export function leerListaEmpresa(params = {}) {
  const guardada = listasEmpresa.get(claveListaEmpresa(params));
  if (!guardada || guardada.expira <= Date.now()) return null;
  return guardada.valor;
}

export async function listarEntregasEmpresa(params = {}, opciones = {}) {
  const clave = claveListaEmpresa(params);
  if (opciones.fresco) {
    generacionListaEmpresa += 1;
    listasEmpresa.clear();
    vuelosListaEmpresa.clear();
  } else {
    const guardada = leerListaEmpresa(params);
    if (guardada) return guardada;
    const vuelo = vuelosListaEmpresa.get(clave);
    if (vuelo) return vuelo;
  }

  const consulta = new URLSearchParams();
  for (const [nombre, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor));
  }
  if (opciones.fresco) consulta.set('fresco', '1');
  const qs = consulta.toString();
  const marca = generacionListaEmpresa;
  const promesa = request(`/empresa/entregas${qs ? `?${qs}` : ''}`).then((res) => {
    if (marca === generacionListaEmpresa) {
      listasEmpresa.set(clave, { valor: res, expira: Date.now() + CACHE_LISTA_EMPRESA_MS });
    }
    return res;
  }).finally(() => {
    if (vuelosListaEmpresa.get(clave) === promesa) vuelosListaEmpresa.delete(clave);
  });
  vuelosListaEmpresa.set(clave, promesa);
  return promesa;
}

export function precalentarVistasEmpresa(params = {}) {
  if (Number(params.pagina) !== 1) return;
  const otras = VISTAS_EMPRESA.filter((vista) => vista !== params.vista);
  colaVistasEmpresa = colaVistasEmpresa
    .catch(() => {})
    .then(async () => {
      for (const vista of otras) {
        try {
          await listarEntregasEmpresa({ ...params, vista, pagina: 1 });
        } catch {
          /* Esa vista se vuelve a pedir cuando el usuario la abre. */
        }
      }
    });
}

export async function detalleEntregaEmpresa(numero) {
  return request(`/empresa/entregas/${encodeURIComponent(numero)}`);
}

export async function sincronizarAgendaConductor() {
  return request('/auth/sesion?sincronizar=1');
}

export async function obtenerSesionConductor() {
  return request('/auth/sesion');
}

export async function salirConductor() {
  try {
    await request('/auth/salir', { method: 'POST' });
  } catch {
    /* si la red falla, el servidor sigue siendo quien invalida la cookie */
  }
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
      credentials: 'include',
      headers: apiHeaders(),
    });
  } catch {
    throw new ApiError('No se pudo conectar al guardar. Sus datos no se enviaron.', { network: true });
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || `Error ${res.status}`, { status: res.status });
  return json;
}
