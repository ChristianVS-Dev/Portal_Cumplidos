import { tieneAlgunaMotivoNov } from '../domain/motivos-no-contesto.js';
import * as cumplidosService from '../services/cumplidos.service.js';
import { validarArchivo } from '../services/adjuntos.service.js';
import { toJsonSafe } from '../utils/serialize.js';

function validarCompletar(body) {
  const miss = [];
  if (!body?.numeroEntrega?.trim()) miss.push('número de entrega');
  if (!body?.modo || !['ok', 'nov'].includes(body.modo)) miss.push('modo');
  if (!body?.transportista?.trim()) miss.push('transportista');
  if (!body?.placa?.trim()) miss.push('placa');
  if (!body?.fechaEntrega) miss.push('fecha');
  if (!body?.terminosAceptados) miss.push('términos y condiciones');
  if (body?.modo === 'nov' && !body?.descripcionNovedad?.trim()) {
    miss.push('descripción de no contestó');
  }
  if (body?.modo === 'nov' && !tieneAlgunaMotivoNov(body)) {
    miss.push('al menos un motivo de novedad');
  }
  if (miss.length) {
    throw Object.assign(new Error(`Faltan: ${miss.join(', ')}`), { status: 400 });
  }
}

export async function crear(req, res, next) {
  try {
    const body = req.cumplidoData;
    validarCompletar(body);
    for (const archivo of req.archivosMapeados || []) {
      validarArchivo(archivo);
    }
    const resultado = await cumplidosService.crearCumplido(body, req.archivosMapeados || []);
    const syncSap = resultado.syncSap;
    let mensaje =
      body.modo === 'ok'
        ? `Entrega ${body.numeroEntrega} registrada correctamente`
        : `No contestó ${body.numeroEntrega} registrado correctamente`;

    let advertenciaSap = null;
    if (syncSap?.estado === 'error') {
      advertenciaSap = syncSap.mensaje || 'No se pudo enviar el ZIP a la API de adjuntos';
      mensaje = `${mensaje}. Los datos quedaron guardados en el portal, pero el envío a SAP falló.`;
    } else if (syncSap?.simulado) {
      advertenciaSap =
        'Modo simulación (SAP_USE_MOCK=true): el ZIP no se envió a la API real de adjuntos.';
    }

    res.status(201).json({
      ok: true,
      registroGuardado: true,
      syncSapOk: syncSap?.estado === 'ok',
      data: resultado,
      mensaje,
      advertenciaSap,
      syncSap: syncSap || null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

export async function subirAdjunto(req, res, next) {
  try {
    const { id } = req.params;
    const tipo = req.body?.tipo || 'cumplido';
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Archivo requerido' });
    }
    validarArchivo(req.file);
    const data = await cumplidosService.subirAdjunto(id, req.file, tipo);
    res.status(201).json({
      ok: true,
      data,
      mensaje: 'Adjunto guardado en el sistema',
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

export async function actualizarBorrador(req, res, next) {
  try {
    const { transportista, placa, fechaEntrega, horaEntrega, modo } = req.body || {};
    if (!transportista?.trim() || !placa?.trim() || !fechaEntrega) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan transportista, placa o fecha de entrega',
      });
    }
    if (!horaEntrega?.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'Falta la hora de entrega (paso 1)',
      });
    }
    const data = await cumplidosService.actualizarBorrador(req.params.id, {
      transportista,
      placa,
      fechaEntrega,
      horaEntrega,
      modo,
    });
    res.json({ ok: true, data, mensaje: 'Datos del paso 1 guardados' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

export async function completar(req, res, next) {
  try {
    const body = req.body;
    validarCompletar(body);
    const resultado = await cumplidosService.completarRegistro(req.params.id, body);
    res.json({
      ok: true,
      data: resultado,
      mensaje:
        body.modo === 'ok'
          ? `Entrega ${resultado.numeroEntrega} registrada correctamente`
          : `No contestó ${resultado.numeroEntrega} guardado`,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

export async function obtener(req, res, next) {
  try {
    const cumplido = await cumplidosService.obtenerCumplido(req.params.id);
    if (!cumplido) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    }
    res.json({ ok: true, data: cumplido });
  } catch (err) {
    next(err);
  }
}

export async function metricas(_req, res, next) {
  try {
    const data = await cumplidosService.obtenerMetricas();
    res.json({ ok: true, data: toJsonSafe(data) });
  } catch (err) {
    console.error('[metricas]', err);
    res.json({ ok: true, data: cumplidosService.metricasVacias() });
  }
}

export async function reintentarAdjunto(req, res, next) {
  try {
    const { reintentarSyncAdjunto } = await import('../services/adjuntos.service.js');
    const result = await reintentarSyncAdjunto(req.params.adjuntoId);
    if (!result) {
      return res.status(404).json({ ok: false, error: 'Adjunto no encontrado' });
    }
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
}
