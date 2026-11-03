import { config } from '../config/index.js';
import { normalizarCodigoTransportista } from '../domain/conductor-acceso.js';
import { entregasApiReadHeaders, mensajeError401Entregas } from '../utils/entregasApiClient.js';
import { crearCache } from '../utils/cacheCorta.js';

const cacheListas = crearCache({ ttlMs: 90_000, max: 80 });
const generacionLista = new Map();

const VISTAS = new Set(['dia', 'pendientes', 'programadas', 'todas']);

function baseTransportistas() {
  return config.entregasExterna.baseUrl.replace(/\/$/, '').replace(/\/entregas$/, '/transportistas');
}

function texto(valor) {
  if (valor == null) return '';
  if (typeof valor === 'string' || typeof valor === 'number') return String(valor);
  return valor.descripcion || valor.nombre || valor.codigo || '';
}

function entregaVisible(item) {
  if (!item) return null;
  const cliente = item.cliente || {};
  const transporte = item.transporte || {};
  const conductor = transporte.conductor || {};
  return {
    numero: String(item.vbeln || item.numero || ''),
    grupo: item.grupo || '',
    fechaEntrega: item.fecha_entrega || item.fechaEntrega || '',
    tipo: texto(item.tipo_entrega || item.tipoEntrega),
    cliente: cliente.nombre || '',
    direccion: cliente.direccion || '',
    ciudad: cliente.ciudad || '',
    transporte: transporte.tknum || '',
    nombreTransporte: transporte.nombre || '',
    placa: transporte.placa || '',
    conductor: conductor.nombre || '',
    pendiente: Boolean(item.pendiente),
    entregada: Boolean(item.entregada),
  };
}

function empresaVisible(origen) {
  if (!origen) return null;
  return {
    codigo: origen.codigo || '',
    nombre: origen.nombre || '',
    nit: origen.nit || '',
    existe: origen.existe !== false,
  };
}

function opcionesLista(query = {}) {
  const vista = VISTAS.has(query.vista) ? query.vista : 'dia';
  const pagina = Math.min(500, Math.max(1, parseInt(query.pagina, 10) || 1));
  const limite = Math.min(100, Math.max(1, parseInt(query.limite, 10) || 50));
  const dias = Math.min(30, Math.max(1, parseInt(query.dias, 10) || 7));
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(query.fecha || '')) ? String(query.fecha) : '';
  return { vista, pagina, limite, dias, fecha };
}

async function consultarTransportista(ruta) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.entregasExterna.timeoutMs);
  try {
    const res = await fetch(ruta, {
      method: 'GET',
      headers: { Accept: 'application/json', ...entregasApiReadHeaders() },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (res.status === 404) return { status: 404, json };
    if (!res.ok) {
      const msg = res.status === 401
        ? mensajeError401Entregas(res.status, json)
        : json?.message || json?.error || 'El servicio de entregas no respondió';
      throw Object.assign(new Error(msg), { status: res.status >= 500 ? 502 : res.status });
    }
    return { status: res.status, json };
  } catch (err) {
    if (err.status) throw err;
    const code = err.cause?.code || err.code || '';
    const sinRespuesta = err.name === 'AbortError' || String(code).startsWith('UND_ERR_');
    throw Object.assign(
      new Error(
        sinRespuesta
          ? 'El servicio de entregas no respondió a tiempo. Intente de nuevo en unos segundos.'
          : 'No hay comunicación con el servicio de entregas.'
      ),
      { status: sinRespuesta ? 504 : 502, code: sinRespuesta ? 'ENTREGAS_TIMEOUT' : 'ENTREGAS_RED' }
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function pedirLista(codigo, opciones) {
  const params = new URLSearchParams({
    vista: opciones.vista,
    pagina: String(opciones.pagina),
    limite: String(opciones.limite),
    dias: String(opciones.dias),
  });
  if (opciones.fecha) params.set('fecha', opciones.fecha);
  const { status, json } = await consultarTransportista(
    `${baseTransportistas()}/${encodeURIComponent(codigo)}/entregas?${params}`
  );
  if (status === 404 || json?.transportista?.existe === false || json?.existe === false) {
    throw Object.assign(new Error('No encontramos una empresa con ese código de transportista.'), { status: 404 });
  }
  const entregas = Array.isArray(json?.entregas) ? json.entregas.map(entregaVisible).filter((item) => item.numero) : [];
  return {
    fecha: json?.fecha || opciones.fecha,
    desde: json?.desde || '',
    dias: json?.dias ?? opciones.dias,
    vista: opciones.vista,
    truncado: Boolean(json?.truncado),
    transportista: empresaVisible(json?.transportista),
    totales: {
      transportes: Number(json?.totales?.transportes) || 0,
      delDia: Number(json?.totales?.del_dia) || 0,
      pendientes: Number(json?.totales?.pendientes) || 0,
      programadas: Number(json?.totales?.programadas) || 0,
    },
    pagina: Number(json?.pagina) || opciones.pagina,
    limite: Number(json?.limite) || opciones.limite,
    paginas: Number(json?.paginas) || 1,
    total: Number(json?.total_vista) || entregas.length,
    entregas,
  };
}

export async function listarEntregasEmpresa(codigoCrudo, query = {}) {
  const codigo = normalizarCodigoTransportista(codigoCrudo);
  if (!codigo) {
    throw Object.assign(new Error('El código de transportista no es válido'), { status: 400 });
  }
  const opciones = opcionesLista(query);
  const fresco = query.fresco === '1' || query.fresco === 'true';
  if (fresco) generacionLista.set(codigo, (generacionLista.get(codigo) || 0) + 1);
  const clave = [
    generacionLista.get(codigo) || 0,
    codigo,
    opciones.fecha,
    opciones.dias,
    opciones.vista,
    opciones.pagina,
    opciones.limite,
  ].join('|');
  return cacheListas.obtener(clave, () => pedirLista(codigo, opciones));
}

export async function consultarEntregaEmpresa(codigoCrudo, numeroCrudo) {
  const codigo = normalizarCodigoTransportista(codigoCrudo);
  const numero = String(numeroCrudo || '').replace(/\D/g, '').slice(0, 12);
  if (!codigo || !numero) {
    throw Object.assign(new Error('La entrega no es válida'), { status: 400 });
  }
  const { status, json } = await consultarTransportista(
    `${baseTransportistas()}/${encodeURIComponent(codigo)}/entregas/${encodeURIComponent(numero)}`
  );
  if (status === 404 || json?.existe === false) {
    return { existe: false, pertenece: false, puedeAdjuntar: false, entrega: null, transportista: null };
  }
  return {
    existe: true,
    pertenece: Boolean(json?.pertenece),
    puedeAdjuntar: Boolean(json?.puede_adjuntar),
    transportista: empresaVisible(json?.transportista),
    entrega: entregaVisible(json?.entrega),
  };
}
