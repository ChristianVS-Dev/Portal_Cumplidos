import * as cumplidosService from '../services/cumplidos.service.js';
import * as entregasService from '../services/entregas.service.js';
import { toJsonSafe } from '../utils/serialize.js';

export async function detalle(req, res, next) {
  try {
    const { numero } = req.params;
    const resultado = await entregasService.obtenerDetalleEntrega(numero);
    if (!resultado.encontrado) {
      return res.status(404).json({ ok: false, error: `Entrega "${numero}" no encontrada` });
    }
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
      return res.status(404).json({
        ok: false,
        error: `Entrega "${numero}" no encontrada`,
      });
    }

    let mensaje;
    if (resultado.tipo === 'entrega' && resultado.tknum) {
      mensaje = `Entrega ${resultado.vbeln} · transporte ${resultado.tknum} · ${resultado.totalEntregas} en ruta`;
    } else if (resultado.guardadoEnMysql) {
      mensaje = 'Información guardada en MySQL';
    }
    // avisoRegistro va solo en data.avisoRegistro (un banner en front), no duplicar en mensaje

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
    console.error('[entregas.buscar]', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Error al consultar la entrega',
    });
  }
}

export async function registrarVisita(req, res, next) {
  try {
    const { numero } = req.params;
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
