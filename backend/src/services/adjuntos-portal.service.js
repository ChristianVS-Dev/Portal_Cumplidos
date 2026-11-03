import crypto from 'crypto';
import { config } from '../config/index.js';
import { getSupabase } from '../db/supabase.js';
import { normalizarEmail, transporteDelConductor } from '../domain/conductor-acceso.js';
import { consultarEntregaEmpresa } from './empresa-entregas.service.js';
import { consultarEntrega, invalidarConsultaEntrega } from './entregas-externa.service.js';
import { enviarAvisoAdjuntoAdicional } from './email.service.js';
import { buildDescripcionAdjuntoSap, enviarAdjuntoSap, registrarIntentoEntregaSap } from './sap.service.js';
import { invalidarAdjuntosEntrega } from './adjuntos-sap.service.js';
import { registrarEvento } from './trazabilidad.service.js';
import { archivosAZip, nombreZipBundleParaSap } from '../utils/zipAdjunto.js';

const TIPOS = new Set(['cumplido', 'ev_lugar', 'ev_captura', 'ev_aviso']);

function hashArchivo(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function entregaYaConfirmada(filas) {
  return (filas || []).some((row) => /entregad/i.test(String(row.estado || '')));
}

/**
 * Envía el ZIP a SAP y guarda el conteo vigente en el portal.
 * Si la entrega ya está confirmada, no registra otro intento: solo reemplaza los adjuntos.
 */
export async function registrarAdjuntosPortal(datos, archivos, acceso) {
  const numero = String(datos.numeroEntrega || '').trim();
  if (!acceso?.conductorId) {
    throw Object.assign(new Error('La sesión no permite registrar adjuntos'), { status: 401 });
  }
  if (!archivos.length) {
    throw Object.assign(new Error('Adjunte al menos un archivo para enviar'), { status: 400 });
  }

  const doc = await consultarEntrega(numero);
  if (!doc || !transporteDelConductor(acceso, doc.transporte)) {
    await registrarEvento({
      conductorId: acceso.conductorId,
      sesionId: acceso.sesionId,
      accion: 'enviar_adjuntos',
      numeroEntrega: numero,
      resultado: 'rechazado',
    });
    throw Object.assign(new Error('Entrega no disponible para esta cuenta'), { status: 404 });
  }

  const sb = getSupabase();
  const { data: filas, error: errorFilas } = await sb
    .from('pc_viaje_dia')
    .select('estado')
    .eq('conductor_id', acceso.conductorId)
    .eq('numero_entrega', numero);
  if (errorFilas) {
    throw Object.assign(new Error('No se pudo revisar el estado de la entrega'), { status: 503 });
  }

  const reemplazo = entregaYaConfirmada(filas);
  const entradas = archivos.map((archivo) => ({
    buffer: archivo.buffer,
    name: archivo.originalname || 'documento',
  }));
  const zipBuffer = await archivosAZip(entradas);
  const loteId = crypto.randomUUID();
  const descripcion = buildDescripcionAdjuntoSap({
    ...datos,
    numeroEntrega: numero,
    placa: datos.placa || acceso.placa,
    conductor_documento: acceso.cedula,
    total_archivos: entradas.length,
  });

  const sapAdjunto = await enviarAdjuntoSap({
    numeroEntrega: numero,
    descripcion,
    tipo: archivos.find((archivo) => archivo.tipo === 'cumplido')?.tipo || archivos[0].tipo || 'cumplido',
    archivo: {
      nombreOriginal: nombreZipBundleParaSap(numero, loteId),
      buffer: zipBuffer,
      mimeType: 'application/zip',
      esZip: true,
      archivosInternos: entradas.map((entrada) => entrada.name),
    },
  });

  let syncIntento = { estado: 'omitido', mensaje: 'La entrega ya estaba confirmada. Solo se reemplazaron los adjuntos.' };
  if (!reemplazo) {
    syncIntento = await registrarIntentoEntregaSap(numero, datos.modo, {
      observacion: datos.modo === 'ok' ? datos.observaciones : datos.descripcionNovedad,
    });
  }

  const { error: errorBaja } = await sb
    .from('pc_adjunto_entrega')
    .update({ vigente: false })
    .eq('conductor_id', acceso.conductorId)
    .eq('numero_entrega', numero)
    .eq('vigente', true);
  if (errorBaja) {
    throw Object.assign(new Error('El archivo se envió, pero no se pudo actualizar el conteo'), { status: 503 });
  }

  const filasAdjunto = archivos.map((archivo) => ({
    conductor_id: acceso.conductorId,
    numero_entrega: numero,
    nombre: String(archivo.originalname || 'documento').slice(0, 180),
    tipo: TIPOS.has(archivo.tipo) ? archivo.tipo : 'cumplido',
    sha256: hashArchivo(archivo.buffer),
    estado_sync: 'ok',
    sap_doc_id: sapAdjunto.sapDocId || null,
    lote_id: loteId,
    vigente: true,
  }));
  const { error: errorAlta } = await sb.from('pc_adjunto_entrega').insert(filasAdjunto);
  if (errorAlta) {
    throw Object.assign(new Error('El archivo se envió, pero no se pudo guardar el conteo'), { status: 503 });
  }

  if (!reemplazo) {
    const intento = Number(syncIntento.intento);
    const estado = datos.modo === 'ok' ? 'Entregada' : 'Pendiente';
    const { error: errorViaje } = await sb
      .from('pc_viaje_dia')
      .update({
        estado,
        ...(Number.isFinite(intento) && intento > 0 ? { intento: Math.min(99, Math.trunc(intento)) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('conductor_id', acceso.conductorId)
      .eq('numero_entrega', numero);
    if (errorViaje) console.error('No se actualizó el intento local:', errorViaje.message);
  }

  invalidarAdjuntosEntrega(numero);
  invalidarConsultaEntrega(numero);

  await registrarEvento({
    conductorId: acceso.conductorId,
    sesionId: acceso.sesionId,
    accion: reemplazo ? 'reemplazar_adjuntos' : 'enviar_adjuntos',
    numeroEntrega: numero,
    docId: sapAdjunto.sapDocId || null,
    resultado: 'ok',
    detalle: {
      loteId,
      total: filasAdjunto.length,
      modo: datos.modo || null,
      intento: syncIntento.intento ?? null,
    },
  });

  return {
    id: loteId,
    numeroEntrega: numero,
    modo: datos.modo,
    reemplazo,
    totalAdjuntos: filasAdjunto.length,
    adjuntos: filasAdjunto.map((fila) => ({ nombre: fila.nombre, tipo: fila.tipo })),
    syncSap: {
      estado: 'ok',
      sapDocId: sapAdjunto.sapDocId || null,
      mensaje: sapAdjunto.mensaje,
      simulado: Boolean(sapAdjunto.simulado),
      totalArchivos: entradas.length,
    },
    syncIntentoSap: {
      estado: reemplazo ? 'omitido' : 'ok',
      intento: syncIntento.intento ?? null,
      mensaje: syncIntento.mensaje,
      simulado: Boolean(syncIntento.simulado),
    },
  };
}

function observacionAdjunto(valor) {
  const texto = String(valor || '').replace(/\s+/g, ' ').trim();
  if (!texto) {
    throw Object.assign(new Error('Escriba la observación del adjunto'), { status: 400 });
  }
  if (texto.length > 500) {
    throw Object.assign(new Error('La observación admite hasta 500 caracteres'), { status: 400 });
  }
  return texto;
}

/**
 * Envía un ZIP adicional desde la consulta. No borra el adjunto anterior ni registra otro intento.
 * Si ya había un cumplido, avisa al correo EMAIL_NOTIFICATION con la observación.
 */
function copiasAdjunto(valor) {
  const partes = (Array.isArray(valor) ? valor : [valor])
    .flatMap((item) => String(item || '').split(/[,;\n]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  if (partes.length > 5) {
    throw Object.assign(new Error('Puede agregar hasta 5 correos de copia'), { status: 400 });
  }
  const vistos = new Set();
  const correos = [];
  for (const parte of partes) {
    const correo = normalizarEmail(parte);
    if (!correo) {
      throw Object.assign(new Error('Hay un correo de copia que no es válido'), { status: 400 });
    }
    if (vistos.has(correo)) continue;
    vistos.add(correo);
    correos.push(correo);
  }
  return correos;
}

export async function reemplazarAdjuntoConsulta(numeroEntrega, archivos, acceso, observacion, copiaCruda) {
  const numero = String(numeroEntrega || '').trim();
  const nota = observacionAdjunto(observacion);
  const copias = copiasAdjunto(copiaCruda);
  if (!acceso?.conductorId) {
    throw Object.assign(new Error('La sesión no permite registrar adjuntos'), { status: 401 });
  }
  if (!archivos?.length) {
    throw Object.assign(new Error('Adjunte al menos un archivo para enviar'), { status: 400 });
  }

  let placaAviso = acceso.placa || '';
  if (acceso.tipo === 'empresa') {
    const propia = await consultarEntregaEmpresa(acceso.transportistaCodigo, numero);
    if (!propia?.puedeAdjuntar) {
      await registrarEvento({
        conductorId: acceso.conductorId,
        sesionId: acceso.sesionId,
        accion: 'reemplazar_adjuntos',
        numeroEntrega: numero,
        resultado: 'rechazado',
      });
      throw Object.assign(new Error('Entrega no disponible para esta cuenta'), { status: 404 });
    }
    placaAviso = propia.entrega?.placa || '';
  } else {
    const doc = await consultarEntrega(numero);
    if (!doc || !transporteDelConductor(acceso, doc.transporte)) {
      await registrarEvento({
        conductorId: acceso.conductorId,
        sesionId: acceso.sesionId,
        accion: 'reemplazar_adjuntos',
        numeroEntrega: numero,
        resultado: 'rechazado',
      });
      throw Object.assign(new Error('Entrega no disponible para esta cuenta'), { status: 404 });
    }
    placaAviso = acceso.placa || doc.transporte?.placa || '';
  }

  const entradas = archivos.map((archivo) => ({
    buffer: archivo.buffer,
    name: archivo.originalname || 'documento',
  }));
  const zipBuffer = await archivosAZip(entradas);
  const loteId = crypto.randomUUID();
  const descripcion = [
    'ANEXO SUBIDO PORTAL CONDUCTOR',
    'Adjunto adicional',
    `Entrega ${numero}`,
    acceso.tipo === 'empresa'
      ? `Empresa ${acceso.transportistaCodigo}`
      : acceso.cedula ? `CC ${acceso.cedula}` : null,
    placaAviso ? `Placa ${placaAviso}` : null,
    `${entradas.length} archivo(s) en ZIP`,
    `Obs: ${nota}`,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500);

  let sapAdjunto;
  try {
    sapAdjunto = await enviarAdjuntoSap({
      numeroEntrega: numero,
      descripcion,
      tipo: 'cumplido',
      archivo: {
        nombreOriginal: nombreZipBundleParaSap(numero, loteId),
        buffer: zipBuffer,
        mimeType: 'application/zip',
        esZip: true,
        archivosInternos: entradas.map((entrada) => entrada.name),
      },
    });
  } catch (error) {
    const base = String(error.message || 'SAP no confirmó el adjunto.');
    const texto = /correo/i.test(base) ? base : `${base} No se envió el correo.`;
    throw Object.assign(new Error(texto), { status: error.status || 502, code: error.code });
  }
  const confirmadoSap = Boolean(sapAdjunto?.sapDocId) && sapAdjunto.simulado !== true;
  if (!confirmadoSap) {
    throw Object.assign(
      new Error('SAP no confirmó el adjunto. No se envió el correo.'),
      { status: 502, code: 'SAP_SIN_CONFIRMACION' }
    );
  }

  const sb = getSupabase();
  const { count: previos } = await sb
    .from('pc_adjunto_entrega')
    .select('id', { count: 'exact', head: true })
    .eq('numero_entrega', numero)
    .eq('vigente', true);

  const filasAdjunto = archivos.map((archivo) => ({
    conductor_id: acceso.conductorId,
    numero_entrega: numero,
    nombre: String(archivo.originalname || 'documento').slice(0, 180),
    tipo: 'cumplido',
    sha256: hashArchivo(archivo.buffer),
    estado_sync: 'ok',
    sap_doc_id: sapAdjunto.sapDocId || null,
    lote_id: loteId,
    vigente: true,
  }));
  const { error: errorAlta } = await sb.from('pc_adjunto_entrega').insert(filasAdjunto);
  if (errorAlta) {
    throw Object.assign(new Error('El archivo se envió, pero no se pudo guardar el conteo'), { status: 503 });
  }

  invalidarAdjuntosEntrega(numero);
  invalidarConsultaEntrega(numero);

  const { data: conductor } = await sb
    .from('pc_conductor')
    .select('nombre')
    .eq('id', acceso.conductorId)
    .maybeSingle();
  const placa = placaAviso;
  const segundo = (previos || 0) >= 1;
  const destino = normalizarEmail(config.auth.emailNotification);
  const debeAvisar = segundo || copias.length > 0;
  let avisoEncargado = false;
  let avisoError = '';
  if (debeAvisar) {
    if (!destino) {
      avisoError = 'El adjunto quedó en SAP, pero no hay un correo de aviso configurado.';
    } else {
      const copiasAviso = copias.filter((correo) => correo !== destino);
      try {
        const aviso = await enviarAvisoAdjuntoAdicional({
          to: destino,
          cc: copiasAviso.join(', '),
          entrega: numero,
          observacion: nota,
          conductor: {
            nombre: conductor?.nombre,
            cedula: acceso.tipo === 'empresa' ? acceso.transportistaCodigo : acceso.cedula,
            placa,
          },
          archivos: entradas.map((entrada) => entrada.name),
          segundo,
        });
        avisoEncargado = Boolean(aviso && aviso.enviado !== false && aviso.simulado === false);
        if (!avisoEncargado) {
          avisoError = 'El adjunto quedó en SAP, pero no se pudo enviar el correo.';
        }
      } catch (error) {
        console.error('Aviso de adjunto: no se pudo enviar el correo');
        avisoError = 'El adjunto quedó en SAP, pero no se pudo enviar el correo.';
      }
    }
  }

  await registrarEvento({
    conductorId: acceso.conductorId,
    sesionId: acceso.sesionId,
    accion: 'enviar_adjunto_adicional',
    numeroEntrega: numero,
    docId: sapAdjunto.sapDocId || null,
    resultado: 'ok',
    detalle: { loteId, total: filasAdjunto.length, intento: null, avisoEncargado, segundo },
  });

  return {
    numeroEntrega: numero,
    totalAdjuntos: filasAdjunto.length,
    avisoEncargado,
    avisoError,
    syncSap: {
      estado: 'ok',
      sapDocId: sapAdjunto.sapDocId || null,
      mensaje: sapAdjunto.mensaje,
      simulado: Boolean(sapAdjunto.simulado),
    },
  };
}
