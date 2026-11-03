import { Readable } from 'stream';
import { getSupabase } from '../db/supabase.js';
import { crearCache } from '../utils/cacheCorta.js';

const cacheListado = crearCache({ ttlMs: 20_000, max: 300 });
import {
  entregasApiReadHeaders,
  mensajeError401Entregas,
  urlAdjuntoDocumento,
  urlAdjuntosEntrega,
} from '../utils/entregasApiClient.js';

function errorSap(status, json) {
  const mensaje =
    status === 401
      ? mensajeError401Entregas(status, json)
      : json?.message || json?.error || json?.mensaje || 'La consulta de adjuntos no respondió';
  return Object.assign(new Error(mensaje), { status: status === 404 ? 404 : status >= 500 ? 502 : status });
}

async function leerJson(res) {
  const texto = await res.text().catch(() => '');
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch {
    return { message: texto.slice(0, 180) };
  }
}

const MARCA_PORTAL = 'ANEXO SUBIDO PORTAL CONDUCTOR';

/** El ZIP del portal se llama cumplido_{entrega}_{lote}.zip y su descripción empieza por la marca. */
export function esAdjuntoPortal(item) {
  const texto = `${item?.descripcion || ''} ${item?.nombre || ''}`.toUpperCase();
  if (texto.includes(MARCA_PORTAL)) return true;
  return /^cumplido_.+\.zip$/i.test(String(item?.nombre || '').trim());
}

function mapAdjunto(item) {
  const docId = String(item?.docId || '').trim();
  if (!docId) return null;
  return {
    docId,
    nombre: item.nombre || 'Adjunto',
    descripcion: item.descripcion || null,
    extension: item.extension || null,
    tamano: Number(item.tamano) || 0,
    fecha: item.fecha || null,
    hora: item.hora || null,
    usuario: item.usuario_nombre || item.usuario || null,
  };
}

async function consultarListado(numeroEntrega) {
  const res = await fetch(urlAdjuntosEntrega(numeroEntrega), {
    headers: { Accept: 'application/json', ...entregasApiReadHeaders() },
  });
  const json = await leerJson(res);
  if (res.status === 404) return [];
  if (!res.ok) throw errorSap(res.status, json);
  return (json.adjuntos || []).map(mapAdjunto).filter((item) => item && esAdjuntoPortal(item));
}

async function exigirAdjuntoPortal(numeroEntrega, docId) {
  const lista = await listarAdjuntosSap(numeroEntrega);
  const propio = lista.some((item) => item.docId === String(docId || '').trim());
  if (!propio) {
    throw Object.assign(new Error('Ese adjunto no fue cargado desde el portal.'), { status: 404 });
  }
}

export function invalidarAdjuntosEntrega(numeroEntrega) {
  const numero = String(numeroEntrega || '').trim();
  if (numero) cacheListado.invalidar(numero);
}

export async function listarAdjuntosSap(numeroEntrega) {
  const numero = String(numeroEntrega || '').trim();
  const lista = await cacheListado.obtener(numero, () => consultarListado(numero));
  return lista || [];
}

function nombreSeguro(disposition) {
  const crudo = /filename="([^"]+)"/.exec(disposition || '')?.[1] || 'adjunto';
  return crudo.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'adjunto';
}

export async function abrirAdjuntoSap(numeroEntrega, docId, { ver = false } = {}) {
  await exigirAdjuntoPortal(numeroEntrega, docId);
  const url = new URL(urlAdjuntoDocumento(numeroEntrega, docId));
  if (ver) url.searchParams.set('ver', '1');
  const res = await fetch(url, { headers: { ...entregasApiReadHeaders() } });
  if (!res.ok) {
    const json = await leerJson(res);
    throw errorSap(res.status, json);
  }
  if (!res.body) {
    throw Object.assign(new Error('SAP no devolvió el archivo'), { status: 502 });
  }
  const disposition = res.headers.get('content-disposition') || '';
  return {
    body: Readable.fromWeb(res.body),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
    contentLength: res.headers.get('content-length'),
    disposition: `${ver ? 'inline' : 'attachment'}; filename="${nombreSeguro(disposition)}"`,
  };
}

export async function eliminarAdjuntoSap(numeroEntrega, docId, acceso) {
  await exigirAdjuntoPortal(numeroEntrega, docId);
  const url = urlAdjuntoDocumento(numeroEntrega, docId);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...entregasApiReadHeaders() },
  });
  const json = await leerJson(res);
  if (!res.ok) throw errorSap(res.status, json);
  invalidarAdjuntosEntrega(numeroEntrega);

  if (acceso?.conductorId) {
    const sb = getSupabase();
    await sb
      .from('pc_adjunto_entrega')
      .update({ vigente: false })
      .eq('conductor_id', acceso.conductorId)
      .eq('sap_doc_id', docId);
  }

  return { mensaje: json.message || json.mensaje || 'Adjunto eliminado' };
}
