import { config } from '../config/index.js';
import { fechaHoyBogota } from '../domain/conductor-acceso.js';
import { parseFechaTransporte } from '../domain/entrega-display.js';
import { entregasApiReadHeaders } from '../utils/entregasApiClient.js';

function texto(valor) {
  if (valor == null) return null;
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'object') return valor.nombre || valor.descripcion || null;
  return String(valor);
}

function aFechaIso(valor, respaldo) {
  if (!valor) return respaldo;
  const sap = parseFechaTransporte(valor);
  if (sap) return sap;
  const iso = String(valor).match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : respaldo;
}

/** GET /api/conductor/entregas en el mismo host del API de entregas, salvo una URL explícita. */
function urlConductor() {
  const override = config.agenda.baseUrl.replace(/\/$/, '');
  if (override) return override;
  const entregas = (config.entregasExterna.baseUrl || '').replace(/\/$/, '');
  if (!entregas) return '';
  if (entregas.endsWith('/api/entregas')) {
    return `${entregas.slice(0, -'/api/entregas'.length)}/api/conductor/entregas`;
  }
  try {
    return `${new URL(entregas).origin}/api/conductor/entregas`;
  } catch {
    return '';
  }
}

function intentoDe(item) {
  const numero = Number(item?.ultimo_intento?.intento);
  if (!Number.isFinite(numero) || numero < 1) return null;
  return Math.min(99, Math.trunc(numero));
}

function estadoDe(item, grupo) {
  if (item?.entregada === true) return 'Entregada';
  if (grupo === 'programada') return 'Programada';
  if (item?.pendiente === true || grupo === 'pendiente') return 'Pendiente';
  return 'Del día';
}

function mapEntrega(item, grupo, fechaRespaldo) {
  const numero = String(item?.vbeln || item?.numeroEntrega || item?.numero_entrega || '').trim();
  if (!numero) return null;
  const transporte = item?.transporte && typeof item.transporte === 'object' ? item.transporte : {};
  const cliente = item?.cliente;
  const clienteObj = cliente && typeof cliente === 'object' ? cliente : null;
  return {
    numeroEntrega: numero,
    tknum: transporte.tknum || item?.tknum || null,
    cliente: texto(clienteObj ? clienteObj.nombre : cliente),
    direccion: texto(clienteObj ? clienteObj.direccion : item?.direccion),
    ciudad: texto(clienteObj ? clienteObj.ciudad : item?.ciudad),
    estado: estadoDe(item, grupo),
    fecha: aFechaIso(item?.fecha_entrega || transporte.fecha_inicio_ruta, fechaRespaldo),
    intento: intentoDe(item),
    grupo,
  };
}

function incorporar(destino, lista, grupo, fechaRespaldo) {
  for (const item of lista || []) {
    const row = mapEntrega(item, grupo, fechaRespaldo);
    if (!row?.fecha) continue;
    const clave = `${row.fecha}|${row.numeroEntrega}`;
    const previo = destino.get(clave);
    if (!previo || grupo === 'hoy') destino.set(clave, row);
  }
}

/**
 * Transporte del conductor: entregas del día, pendientes y programadas.
 * GET /api/conductor/entregas?cedula=&placa= con el token de entregas.
 */
export async function consultarAgendaConductor({ cedula, placa }) {
  const base = urlConductor();
  if (!base) {
    return { configurada: false, existe: false, entregas: [], conductor: null, totales: null };
  }

  const url = new URL(base);
  url.searchParams.set('cedula', cedula);
  url.searchParams.set('placa', placa);

  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...entregasApiReadHeaders() },
    signal: AbortSignal.timeout(config.agenda.timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(json?.error || json?.message || 'La agenda del conductor no respondió'), {
      status: res.status,
    });
  }

  const fecha = aFechaIso(json.fecha, fechaHoyBogota());
  const entregas = new Map();
  incorporar(entregas, json.pendientes, 'pendiente', fecha);
  incorporar(entregas, json.programadas, 'programada', fecha);
  incorporar(entregas, json.del_dia, 'hoy', fecha);

  return {
    configurada: true,
    existe: json.existe !== false,
    fecha,
    conductor: json.conductor
      ? {
          nombre: texto(json.conductor.nombre),
          cedula: texto(json.conductor.cedula),
          placa: texto(json.conductor.placa),
        }
      : null,
    totales: json.totales || null,
    entregas: [...entregas.values()],
  };
}
