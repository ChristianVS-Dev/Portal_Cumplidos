import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import * as sapService from './sap.service.js';
import { validarContenidoArchivo } from '../utils/fileValidation.js';
import { archivosAZip, nombreZipBundleParaSap } from '../utils/zipAdjunto.js';
import { buildDescripcionAdjuntoSap } from './sap.service.js';
import { labelsMotivosDesdeRegistro, MOTIVOS_NO_CONTESTO } from '../domain/motivos-no-contesto.js';

const TIPOS_VALIDOS = ['cumplido', 'ev_lugar', 'ev_captura', 'ev_aviso'];
const MIME_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

function ensureUploadDir() {
  if (!fs.existsSync(config.upload.dir)) {
    fs.mkdirSync(config.upload.dir, { recursive: true });
  }
}

function hashFile(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function eliminarSiExiste(ruta) {
  try {
    if (ruta && fs.existsSync(ruta)) fs.unlinkSync(ruta);
  } catch (err) {
    console.warn('[adjuntos] No se pudo borrar archivo local:', ruta, err.message);
  }
}

function rutaAbsolutaAdjunto(nombreRelativo) {
  if (!nombreRelativo || nombreRelativo === 'purged') return null;
  return path.join(config.upload.dir, nombreRelativo);
}

function rutaBundlePersistente(cumplidoId) {
  return path.join(config.upload.dir, `${cumplidoId}_bundle.zip`);
}

/**
 * Borra del disco los originales (y ZIP legacy) tras sync SAP ok.
 * Conserva metadatos en MySQL (nombre, hash, sap_doc_id) con ruta = 'purged'.
 */
async function purgarArchivosLocalesTrasSyncOk(cumplidoId) {
  if (!config.upload.purgeAfterSapOk) return { purged: 0 };

  const adjuntos = await query(
    `SELECT id, ruta_almacenamiento FROM pc_adjunto WHERE registro_cumplido_id = :id`,
    { id: cumplidoId }
  );

  let purged = 0;
  for (const adj of adjuntos) {
    const abs = rutaAbsolutaAdjunto(adj.ruta_almacenamiento);
    if (abs) {
      eliminarSiExiste(abs);
      purged += 1;
    }
  }

  // ZIP persistente de versiones anteriores (si existiera)
  eliminarSiExiste(rutaBundlePersistente(cumplidoId));

  await query(
    `UPDATE pc_adjunto SET ruta_almacenamiento = 'purged'
     WHERE registro_cumplido_id = :id
       AND ruta_almacenamiento <> 'purged'`,
    { id: cumplidoId }
  );

  console.info(
    `[adjuntos] Purgados ${purged} archivo(s) local(es) tras sync SAP ok · cumplido=${cumplidoId}`
  );
  return { purged };
}

/**
 * Un solo .zip con todos los adjuntos del registro → SAP.
 * El ZIP se arma en memoria (no se deja en uploads). Tras OK se borran los originales.
 */
async function sincronizarBundleSap(cumplidoId, numeroEntrega, datosRegistro = null) {
  const adjuntos = await query(
    `SELECT id, nombre_original, ruta_almacenamiento, tipo
     FROM pc_adjunto WHERE registro_cumplido_id = :id ORDER BY created_at ASC`,
    { id: cumplidoId }
  );

  if (!adjuntos.length) {
    return { estado: 'omitido', sapDocId: null, totalArchivos: 0 };
  }

  const entradas = [];
  for (const adj of adjuntos) {
    const ruta = rutaAbsolutaAdjunto(adj.ruta_almacenamiento);
    if (!ruta || !fs.existsSync(ruta)) {
      throw Object.assign(
        new Error(
          adj.ruta_almacenamiento === 'purged'
            ? `Adjunto ya enviado a SAP y purgado localmente: ${adj.nombre_original}`
            : `Archivo no encontrado en servidor: ${adj.nombre_original}`
        ),
        { status: 500 }
      );
    }
    entradas.push({
      buffer: fs.readFileSync(ruta),
      name: adj.nombre_original,
    });
  }

  const zipBuffer = await archivosAZip(entradas);
  const nombreZip = nombreZipBundleParaSap(numeroEntrega, cumplidoId);

  const tipoPrincipal =
    adjuntos.find((a) => a.tipo === 'cumplido')?.tipo || adjuntos[0].tipo || 'cumplido';

  const motivosCols = MOTIVOS_NO_CONTESTO.map((m) => `c.${m.column}`).join(', ');
  const [registroRow] = await query(
    `SELECT c.numero_entrega, c.transportista, c.placa, c.modo, c.estado_resultado,
            ${motivosCols},
            e.conductor_nombre, e.conductor_documento
     FROM pc_registro_cumplido c
     LEFT JOIN pc_entrega_sap e ON e.id = c.entrega_sap_id
     WHERE c.id = :id`,
    { id: cumplidoId }
  );
  const descripcion = buildDescripcionAdjuntoSap({
    ...registroRow,
    ...(datosRegistro || {}),
    modo: datosRegistro?.modo ?? registroRow?.modo,
    transportista: datosRegistro?.transportista ?? registroRow?.transportista,
    placa: datosRegistro?.placa ?? registroRow?.placa,
    total_archivos: entradas.length,
    motivosNov: labelsMotivosDesdeRegistro({
      ...registroRow,
      ...(datosRegistro || {}),
    }),
  });

  try {
    const sapRes = await sapService.enviarAdjuntoSap({
      numeroEntrega,
      descripcion,
      archivo: {
        nombreOriginal: nombreZip,
        buffer: zipBuffer,
        mimeType: 'application/zip',
        esZip: true,
        archivosInternos: entradas.map((e) => path.basename(e.name)),
      },
      tipo: tipoPrincipal,
    });

    await query(
      `UPDATE pc_adjunto SET
        estado_sync_sap = 'ok',
        sap_doc_id = :sapDocId,
        intentos_sync = intentos_sync + 1,
        ultimo_error = NULL
       WHERE registro_cumplido_id = :cumplidoId`,
      { cumplidoId, sapDocId: sapRes.sapDocId }
    );

    await purgarArchivosLocalesTrasSyncOk(cumplidoId);

    return {
      estado: 'ok',
      sapDocId: sapRes.sapDocId,
      totalArchivos: entradas.length,
      nombreZip,
      mensaje: sapRes.mensaje,
      archivosPurgados: true,
    };
  } catch (err) {
    const esTimeout = err.code === 'SAP_ADJUNTOS_TIMEOUT';
    await query(
      `UPDATE pc_adjunto SET
        estado_sync_sap = :estado,
        intentos_sync = intentos_sync + 1,
        ultimo_error = :error
       WHERE registro_cumplido_id = :cumplidoId`,
      {
        cumplidoId,
        estado: esTimeout ? 'pendiente' : 'error',
        error: err.message?.slice(0, 500),
      }
    );
    throw err;
  }
}

/**
 * Guarda adjuntos en disco y MySQL.
 * @param {{ sincronizarSapBundle?: boolean, datosRegistro?: object }} opciones
 *   sincronizarSapBundle — true al confirmar paso 3 (un ZIP para todos, ok y no contestó)
 *   datosRegistro — modo/transportista/placa del formulario (antes de completarRegistro)
 */
export async function guardarAdjuntos(cumplidoId, archivos, numeroEntrega, opciones = {}) {
  const { sincronizarSapBundle = false, datosRegistro = null } = opciones;
  ensureUploadDir();
  const resultados = [];

  for (const archivo of archivos) {
    const tipo = TIPOS_VALIDOS.includes(archivo.tipo) ? archivo.tipo : 'cumplido';
    const id = uuidv4();
    const ext = path.extname(archivo.originalname) || '';
    const storedName = `${id}${ext}`;
    const ruta = path.join(config.upload.dir, storedName);
    const buffer = archivo.buffer;
    const sha256 = hashFile(buffer);

    fs.writeFileSync(ruta, buffer);

    await query(
      `INSERT INTO pc_adjunto (
        id, registro_cumplido_id, tipo, nombre_original, mime_type,
        tamano_bytes, ruta_almacenamiento, hash_sha256, estado_sync_sap
      ) VALUES (
        :id, :cumplidoId, :tipo, :nombreOriginal, :mimeType,
        :tamano, :ruta, :hash, 'pendiente'
      )`,
      {
        id,
        cumplidoId,
        tipo,
        nombreOriginal: archivo.originalname,
        mimeType: archivo.mimetype,
        tamano: archivo.size,
        ruta: storedName,
        hash: sha256,
      }
    );

    resultados.push({
      id,
      nombreOriginal: archivo.originalname,
      tipo,
      sync: { estado: 'pendiente', sapDocId: null, error: null },
    });
  }

  let syncSap = null;

  if (sincronizarSapBundle && archivos.length > 0) {
    try {
      const bundle = await sincronizarBundleSap(cumplidoId, numeroEntrega, datosRegistro);
      syncSap = {
        estado: 'ok',
        sapDocId: bundle.sapDocId,
        nombreZip: bundle.nombreZip,
        totalArchivos: bundle.totalArchivos,
        simulado: config.sap.useMock,
        mensaje: bundle.mensaje || null,
      };
      for (const r of resultados) {
        r.sync = {
          estado: 'ok',
          sapDocId: bundle.sapDocId,
          error: null,
          zipBundle: bundle.nombreZip,
          totalEnZip: bundle.totalArchivos,
        };
      }
    } catch (err) {
      const esTimeout = err.code === 'SAP_ADJUNTOS_TIMEOUT';
      console.warn(
        esTimeout ? '[adjuntos] Timeout esperando confirmación SAP:' : '[adjuntos] Error envío ZIP a API SAP:',
        err.message
      );
      syncSap = {
        estado: esTimeout ? 'timeout' : 'error',
        mensaje: err.message,
        codigo: err.code || null,
        status: err.status || null,
        simulado: false,
      };
      for (const r of resultados) {
        r.sync = {
          estado: esTimeout ? 'timeout' : 'error',
          sapDocId: null,
          error: err.message,
        };
      }
    }
  }

  return { archivos: resultados, syncSap };
}

/** MIME y tamaño (usable en fileFilter de multer, antes del buffer) */
export function validarArchivoMeta(file) {
  if (!MIME_PERMITIDOS.includes(file.mimetype)) {
    throw Object.assign(new Error(`Tipo no permitido: ${file.mimetype}`), { status: 400 });
  }
  const maxBytes = config.upload.maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw Object.assign(new Error(`Archivo supera ${config.upload.maxSizeMb} MB`), { status: 400 });
  }
}

/** Validación completa tras multer (incluye firma del contenido) */
export function validarArchivo(file) {
  validarArchivoMeta(file);
  const buffer = file.buffer;
  if (!buffer?.length) {
    throw Object.assign(new Error('Archivo vacío o no legible'), { status: 400 });
  }
  if (!validarContenidoArchivo(buffer, file.mimetype)) {
    throw Object.assign(
      new Error('El contenido del archivo no coincide con el tipo permitido (PDF/JPG/PNG)'),
      { status: 400 }
    );
  }
}

/** Reintenta enviar el ZIP único con todos los adjuntos del mismo registro */
export async function reintentarSyncAdjunto(adjuntoId) {
  const rows = await query(
    `SELECT a.registro_cumplido_id, c.numero_entrega
     FROM pc_adjunto a
     JOIN pc_registro_cumplido c ON c.id = a.registro_cumplido_id
     WHERE a.id = :id`,
    { id: adjuntoId }
  );
  if (!rows.length) return null;

  const { registro_cumplido_id: cumplidoId, numero_entrega: numeroEntrega } = rows[0];

  try {
    return await sincronizarBundleSap(cumplidoId, numeroEntrega);
  } catch (err) {
    throw err;
  }
}

export async function reintentarSyncRegistro(cumplidoId) {
  const rows = await query(
    `SELECT numero_entrega FROM pc_registro_cumplido WHERE id = :id`,
    { id: cumplidoId }
  );
  if (!rows.length) return null;
  return sincronizarBundleSap(cumplidoId, rows[0].numero_entrega);
}

/**
 * Limpia disco de adjuntos ya sincronizados a SAP (estado_sync_sap = ok)
 * que aún tengan archivo local. Útil una vez tras desplegar esta versión.
 */
export async function purgarArchivosYaSincronizados({ limit = 1000 } = {}) {
  if (!config.upload.purgeAfterSapOk) {
    return { registros: 0, archivos: 0, omitido: true };
  }

  const ids = await query(
    `SELECT DISTINCT registro_cumplido_id AS id
     FROM pc_adjunto
     WHERE estado_sync_sap = 'ok'
       AND ruta_almacenamiento IS NOT NULL
       AND ruta_almacenamiento <> ''
       AND ruta_almacenamiento <> 'purged'
     LIMIT ${Number(limit) || 1000}`
  );

  let archivos = 0;
  for (const row of ids) {
    const r = await purgarArchivosLocalesTrasSyncOk(row.id);
    archivos += r.purged || 0;
  }

  console.info(
    `[adjuntos] Purga legacy: ${ids.length} registro(s), ${archivos} archivo(s) eliminado(s)`
  );
  return { registros: ids.length, archivos, omitido: false };
}
