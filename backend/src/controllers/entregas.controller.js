import { transporteDelConductor } from '../domain/conductor-acceso.js';
import { consultarEntregaEmpresa } from '../services/empresa-entregas.service.js';
import { validarArchivo } from '../services/adjuntos.service.js';
import { reemplazarAdjuntoConsulta } from '../services/adjuntos-portal.service.js';
import * as adjuntosSap from '../services/adjuntos-sap.service.js';
import * as cumplidosService from '../services/cumplidos.service.js';
import * as entregasService from '../services/entregas.service.js';
import { consultarRutaEntrega } from '../services/ruta.service.js';
import { registrarEvento } from '../services/trazabilidad.service.js';
import { toJsonSafe } from '../utils/serialize.js';

function entregaAjena(acceso, origen) {
  return !transporteDelConductor(acceso, {
    placa: origen?.transporte?.placa || origen?.placa || origen?.sap?.placaAsignada || origen?.sap?.placaSap,
    conductor: origen?.transporte?.conductor || origen?.conductor,
    documentoConductor: origen?.sap?.documentoConductor || origen?.documentoConductor,
  });
}

function noDisponible(res) {
  return res.status(404).json({ ok: false, error: 'Entrega no disponible para esta cuenta' });
}

function trazar(req, campos) {
  return registrarEvento({
    conductorId: req.acceso?.conductorId,
    sesionId: req.acceso?.sesionId,
    numeroEntrega: req.params?.numero,
    ...campos,
  });
}

function rechazar(req, res, accion) {
  void trazar(req, { accion, resultado: 'rechazado' });
  return noDisponible(res);
}

async function exigirEntregaPropia(req, numero) {
  if (req.acceso?.tipo === 'empresa') {
    const propia = await consultarEntregaEmpresa(req.acceso.transportistaCodigo, numero);
    if (!propia?.puedeAdjuntar) return null;
    return { encontrado: true, empresa: true };
  }
  const resultado = await entregasService.obtenerDetalleEntrega(numero);
  if (!resultado.encontrado || entregaAjena(req.acceso, resultado)) return null;
  return resultado;
}

export async function listarAdjuntos(req, res, next) {
  try {
    const numero = req.params.numero;
    const propiaP = exigirEntregaPropia(req, numero);
    const adjuntosP = adjuntosSap.listarAdjuntosSap(numero);
    const propia = await propiaP;
    if (!propia) {
      void adjuntosP.catch(() => {});
      return rechazar(req, res, 'listar_adjuntos');
    }
    const adjuntos = await adjuntosP;
    void trazar(req, { accion: 'listar_adjuntos', resultado: 'ok', detalle: { total: adjuntos.length } });
    res.json({ ok: true, data: { total: adjuntos.length, adjuntos } });
  } catch (err) {
    next(err);
  }
}

export async function abrirAdjunto(req, res, next) {
  try {
    const propia = await exigirEntregaPropia(req, req.params.numero);
    if (!propia) return rechazar(req, res, req.query.ver === '1' ? 'ver_adjunto' : 'descargar_adjunto');
    const ver = req.query.ver === '1';
    const archivo = await adjuntosSap.abrirAdjuntoSap(req.params.numero, req.params.docId, { ver });
    void trazar(req, {
      accion: ver ? 'ver_adjunto' : 'descargar_adjunto',
      docId: req.params.docId,
      resultado: 'ok',
    });
    res.status(200);
    res.setHeader('Content-Type', archivo.contentType);
    res.setHeader('Content-Disposition', archivo.disposition);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (archivo.contentLength) res.setHeader('Content-Length', archivo.contentLength);
    archivo.body.pipe(res);
  } catch (err) {
    if (!res.headersSent) next(err);
  }
}

export async function eliminarAdjunto(_req, res) {
  res.status(403).json({
    ok: false,
    error: 'Los adjuntos no se eliminan. Envíe un archivo nuevo con la observación.',
  });
}

export async function reemplazarAdjuntos(req, res, next) {
  try {
    const archivos = req.files || [];
    if (!archivos.length) {
      return res.status(400).json({ ok: false, error: 'Adjunte al menos un archivo para enviar' });
    }
    for (const archivo of archivos) validarArchivo(archivo);
    const observacion = req.body?.observacion;
    const data = await reemplazarAdjuntoConsulta(
      req.params.numero,
      archivos,
      req.acceso,
      observacion,
      req.body?.copia
    );
    let mensaje = 'El adjunto se envió a SAP. El archivo anterior sigue en la entrega.';
    if (data.avisoError) mensaje = data.avisoError;
    else if (data.avisoEncargado) {
      mensaje = 'El adjunto se envió a SAP y se notificó por correo, con la observación.';
    }
    res.status(201).json({
      ok: true,
      data,
      mensaje,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
    next(err);
  }
}

export async function detalle(req, res, next) {
  try {
    const { numero } = req.params;
    const resultado = await entregasService.obtenerDetalleEntrega(numero);
    if (!resultado.encontrado || entregaAjena(req.acceso, resultado)) {
      return rechazar(req, res, 'ver_detalle');
    }
    void trazar(req, {
      accion: 'ver_detalle',
      resultado: 'ok',
      detalle: { tknum: resultado.tknum || resultado.transporte?.tknum || null },
    });
    res.json({ ok: true, data: resultado });
  } catch (err) {
    next(err);
  }
}

export async function buscar(req, res, next) {
  try {
    const { numero } = req.params;
    const resultado = await cumplidosService.buscarEntregaCompleta(numero);

    if (!resultado.encontrado) {
      void trazar(req, {
        accion: 'seleccionar_entrega',
        resultado: 'rechazado',
        detalle: { motivo: 'sin_documento' },
      });
      return res.status(404).json({
        ok: false,
        code: 'SIN_DOCUMENTO',
        error:
          'Esta entrega todavía no tiene documento en SAP. Por eso no se puede abrir la página de información.',
      });
    }
    if (entregaAjena(req.acceso, resultado)) {
      return rechazar(req, res, 'seleccionar_entrega');
    }

    let mensaje;
    if (resultado.tipo === 'entrega' && resultado.tknum) {
      mensaje = `Entrega ${resultado.vbeln} · transporte ${resultado.tknum} · ${resultado.totalEntregas} en ruta`;
    } else if (resultado.guardadoEnMysql) {
      mensaje = 'Información guardada en MySQL';
    }
    // avisoRegistro va solo en data.avisoRegistro (un banner en front), no duplicar en mensaje

    void trazar(req, {
      accion: 'seleccionar_entrega',
      resultado: 'ok',
      detalle: { tknum: resultado.tknum || null },
    });

    res.json({
      ok: true,
      data: toJsonSafe(resultado),
      mensaje,
      soloLectura: Boolean(resultado.soloLectura),
    });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err.status === 404) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
    }
    console.error('[entregas.buscar]', err.status || '', err.code || '', err.message);
    return res.status(500).json({
      ok: false,
      error: 'No se pudo completar la operación',
    });
  }
}

export async function registrarVisita(req, res, next) {
  try {
    const { numero } = req.params;
    const consulta = await cumplidosService.buscarEntregaCompleta(numero);
    if (!consulta.encontrado || entregaAjena(req.acceso, consulta)) {
      return rechazar(req, res, 'rechazar_entrega');
    }
    const {
      visitaNumero,
      fechaVisita,
      horaVisita,
      fechaEntrega,
      horaEntrega,
      transportista,
      placa,
      modo,
    } = req.body || {};
    const data = await cumplidosService.registrarVisitaEntrega(numero, {
      visitaNumero,
      fechaVisita,
      horaVisita,
      fechaEntrega,
      horaEntrega,
      transportista,
      placa,
      modo,
    });
    res.json({
      ok: true,
      data,
      mensaje: `Visita ${visitaNumero} registrada`,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

function origenDelDispositivo(query) {
  if (query.lat == null || query.lng == null || query.lat === '' || query.lng === '') return null;
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw Object.assign(new Error('La ubicación del dispositivo no es válida'), { status: 400 });
  }
  return { lat, lng };
}

export async function ruta(req, res, next) {
  try {
    const data = await consultarRutaEntrega(req.acceso, req.params.numero, origenDelDispositivo(req.query));
    res.json({ ok: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
    next(err);
  }
}
