import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import { config } from '../config/index.js';
import * as sapService from './sap.service.js';
import * as entregasService from './entregas.service.js';
import * as adjuntosService from './adjuntos.service.js';
import { toJsonSafe } from '../utils/serialize.js';
import {
  bindMotivosSqlParams,
  tieneAlgunaMotivoNov,
  motivosSqlSetClause,
} from '../domain/motivos-no-contesto.js';
import { validarObservacionNovSap } from '../domain/observacion-sap.js';
import { fechaSistema, formatFechaParaApi, formatHoraParaApi } from '../domain/fecha-hora-entrega.js';
import {
  prepararVisitasParaGuardar,
  bindVisitasSqlParams,
  buildGestionVisitasResponse,
  contarIntentosNovEntrega,
  esRegistroEntregaExitosa,
  filtrarRegistrosNovCompletados,
  mapVisitasHistorialDesdeRegistros,
  puedeRegistrarModoNov,
  validarNuevaVisita,
  validarVisitasParaCierre,
  visitasSqlSetClause,
  VISITAS_COLUMNAS,
  MAX_VISITAS_NO_CONTESTO,
} from '../domain/visitas-no-contesto.js';
import { motivosNovDesdeRegistro } from '../domain/motivos-no-contesto.js';

function toNum(v) {
  if (v == null) return 0;
  return Number(v);
}

function estadoResultadoDesdeModo(modo) {
  return modo === 'ok' ? 'entrega_exitosa' : 'no_contesto';
}

/** Estado de visitas y bloqueos (cuenta intentos nov entre registros de la entrega) */
export async function obtenerGestionVisitas(numero) {
  const n = String(numero || '').trim();
  if (!n) {
    return buildGestionVisitasResponse(null, { puedeRegistrarVisita: false });
  }

  const rows = await query(
    `SELECT * FROM pc_registro_cumplido
     WHERE numero_entrega = :n
     ORDER BY completado_at ASC, created_at ASC`,
    { n }
  );

  const borrador = rows
    .filter((r) => r.estado === 'borrador')
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
  const exitosa = rows.find((r) => r.estado === 'completado' && esRegistroEntregaExitosa(r));
  const novCompletados = filtrarRegistrosNovCompletados(rows);
  const intentosNov = contarIntentosNovEntrega(rows);
  const visitasHistorial = mapVisitasHistorialDesdeRegistros(novCompletados);
  const maxIntentos = intentosNov >= MAX_VISITAS_NO_CONTESTO;
  const puedeNov = puedeRegistrarModoNov(rows);

  const historialIntentos = novCompletados.map((r) => ({
    registroId: r.id,
    completadoAt: r.completado_at,
    visita: visitasHistorial.find((v) => v.registroId === r.id) || null,
    motivosLabels: visitasHistorial.find((v) => v.registroId === r.id)?.motivosLabels || [],
  }));

  const baseOpts = {
    visitas: visitasHistorial,
    visitasRegistradas: intentosNov,
    historialIntentos,
    puedeRegistrarModoNov: puedeNov,
    entregaExitosaCompletada: Boolean(exitosa),
    bloqueadoNuevoRegistro: Boolean(exitosa),
    motivoBloqueo: exitosa ? 'entrega_exitosa_registrada' : null,
    entregaFallidaCompletada: maxIntentos && !exitosa,
    puedeRegistrarVisita: puedeNov,
  };

  if (exitosa) {
    return buildGestionVisitasResponse(exitosa, {
      ...baseOpts,
      cumplidoEnBorrador: false,
      puedeRegistrarVisita: false,
      puedeRegistrarModoNov: false,
    });
  }

  if (borrador) {
    return buildGestionVisitasResponse(borrador, {
      ...baseOpts,
      cumplidoEnBorrador: true,
      modoBorrador: borrador.modo,
      puedeRegistrarVisita: puedeNov,
    });
  }

  if (intentosNov > 0) {
    const ultimoNov = novCompletados[novCompletados.length - 1];
    return buildGestionVisitasResponse(ultimoNov, {
      ...baseOpts,
      cumplidoEnBorrador: false,
      puedeRegistrarVisita: puedeNov,
    });
  }

  return buildGestionVisitasResponse(null, {
    ...baseOpts,
    puedeRegistrarVisita: true,
    entregaFallidaCompletada: false,
  });
}

function mapRegistroBorradorParaFront(row) {
  if (!row) return null;
  return {
    cumplidoId: row.id,
    estado: row.estado,
    transportista: row.transportista,
    placa: row.placa,
    fechaEntrega: formatFechaParaApi(row.fecha_entrega),
    horaEntrega: formatHoraParaApi(row.hora_entrega),
    modo: row.modo,
    descripcionNovedad: row.descripcion_novedad || '',
    visitas: [],
    visitasRegistradas: 0,
    motivosNov: motivosNovDesdeRegistro(row),
  };
}

/** Consulta: leer BD (borrador + visitas) antes de fusionar con la API */
async function cargarDatosCumplidoDesdeBd(numeroNorm) {
  const gestionVisitas = await obtenerGestionVisitas(numeroNorm);
  let registroBorrador = null;
  if (gestionVisitas.cumplidoEnBorrador && gestionVisitas.registroId) {
    const [row] = await query(`SELECT * FROM pc_registro_cumplido WHERE id = :id`, {
      id: gestionVisitas.registroId,
    });
    registroBorrador = mapRegistroBorradorParaFront(row);
  }
  return { gestionVisitas, registroBorrador };
}

export async function registrarVisitaEntrega(
  numero,
  { visitaNumero, fechaVisita, horaVisita, fechaEntrega, horaEntrega, transportista, placa, modo } = {}
) {
  const vbeln = String(numero || '').trim();
  const gestionPre = await obtenerGestionVisitas(vbeln);
  if (gestionPre.bloqueadoNuevoRegistro) {
    throw Object.assign(
      new Error('Esta entrega ya fue registrada. No se pueden añadir más visitas.'),
      { status: 400, code: 'ENTREGA_YA_REGISTRADA' }
    );
  }

  const entregaLocal = await entregasService.obtenerPorNumero(vbeln);
  if (!entregaLocal) {
    throw Object.assign(
      new Error('Consulte primero la entrega para poder registrar visitas.'),
      { status: 400 }
    );
  }

  const borrador = await entregasService.obtenerOCrearBorrador(entregaLocal);
  const cumplidoId = borrador.cumplidoId || borrador.id;

  if (fechaEntrega || horaEntrega || transportista || placa || modo) {
    await actualizarBorrador(cumplidoId, {
      fechaEntrega: fechaEntrega || undefined,
      horaEntrega: horaEntrega || undefined,
      transportista,
      placa,
      modo,
    });
  }

  const [row] = await query(`SELECT * FROM pc_registro_cumplido WHERE id = :id`, {
    id: cumplidoId,
  });
  const fVisita = formatFechaParaApi(fechaVisita) || fechaSistema();
  const hVisita =
    formatHoraParaApi(horaVisita) || formatHoraParaApi(row.hora_entrega);
  if (!fVisita) {
    throw Object.assign(new Error('Fecha de visita inválida'), { status: 400 });
  }
  if (!hVisita) {
    throw Object.assign(
      new Error('Indique la hora en datos de entrega (paso 1) antes de guardar la visita'),
      { status: 400 }
    );
  }

  const errVisita = validarNuevaVisita(row, visitaNumero, fVisita, hVisita, {
    intentosNovPrevios: gestionPre.visitasRegistradas,
  });
  if (errVisita) {
    throw Object.assign(new Error(errVisita), { status: 400 });
  }

  const slot = VISITAS_COLUMNAS[Number(visitaNumero) - 1];
  const nIntentos = Number(visitaNumero);

  await query(
    `UPDATE pc_registro_cumplido SET
      ${slot.colFecha} = :fecha,
      ${slot.colHora} = :hora,
      n_intentos = :nIntentos,
      updated_at = NOW()
     WHERE id = :id`,
    {
      id: cumplidoId,
      fecha: fVisita,
      hora: hVisita,
      nIntentos,
    }
  );

  const [actualizado] = await query(`SELECT * FROM pc_registro_cumplido WHERE id = :id`, {
    id: cumplidoId,
  });
  return {
    gestionVisitas: await obtenerGestionVisitas(vbeln),
    registro: { cumplidoId: actualizado.id, estado: actualizado.estado },
  };
}

/** Mensaje corto; el detalle no se repite en sync ni en el mensaje de consulta */
export const AVISO_REGISTRO_PORTAL =
  'Esta entrega ya tiene un registro en el portal';

function avisoRegistroDesdeGestion(gestionVisitas = {}) {
  if (gestionVisitas.bloqueadoNuevoRegistro) {
    return AVISO_REGISTRO_PORTAL;
  }
  return null;
}

async function cargarHistorialCumplidos(numero, limite = 5) {
  try {
    return await query(
      `SELECT id, modo, estado_resultado, transportista, placa, fecha_entrega, hora_entrega,
              observaciones, descripcion_novedad, estado, completado_at, created_at,
              visita_1_fecha, visita_1_hora, n_intentos,
              chk_llamadas, chk_whatsapp, chk_cliente_ausente, chk_cliente_rechaza,
              chk_material_no_solicitado, chk_entrega_parcial
       FROM pc_registro_cumplido
       WHERE numero_entrega = :numero AND estado = 'completado'
       ORDER BY completado_at DESC, created_at DESC
       LIMIT ${limite}`,
      { numero: String(numero).trim() }
    );
  } catch {
    return [];
  }
}

/**
 * Tras consultar la API: fusiona validación BD (visitas, bloqueos) con el payload externo.
 */
async function enriquecerResultadoBusqueda(resultado, numeroNorm, bdPrecargado = null) {
  const { gestionVisitas, registroBorrador } =
    bdPrecargado || (await cargarDatosCumplidoDesdeBd(numeroNorm));
  const historial = await cargarHistorialCumplidos(numeroNorm);

  if (!resultado?.encontrado) {
    return {
      ...resultado,
      gestionVisitas,
      registroBorrador,
      soloLectura: gestionVisitas.bloqueadoNuevoRegistro,
      avisoRegistro: avisoRegistroDesdeGestion(gestionVisitas),
      mysql: { cumplidosPrevios: historial, totalRegistros: historial.length },
    };
  }

  return toJsonSafe({
    ...resultado,
    guardadoEnMysql: Boolean(resultado.guardadoEnMysql ?? resultado.entregaLocal),
    gestionVisitas,
    registroBorrador,
    soloLectura: gestionVisitas.bloqueadoNuevoRegistro,
    avisoRegistro: avisoRegistroDesdeGestion(gestionVisitas),
    mysql: {
      cumplidosPrevios: historial,
      totalRegistros: historial.length,
    },
  });
}

export async function buscarEntregaCompleta(numero) {
  const numeroNorm = String(numero).trim();

  // 1) BD primero: borrador, visitas (visita_N_fecha), motivos, fecha/hora entrega
  const bd = await cargarDatosCumplidoDesdeBd(numeroNorm);

  // 2) API externa + snapshot en pc_entrega_sap
  if (config.entregasExterna.enabled) {
    try {
      const resultado = await entregasService.consultarPorVbeln(numero);
      return await enriquecerResultadoBusqueda(resultado, numeroNorm, bd);
    } catch (err) {
      console.error('[buscarEntregaCompleta]', err.message);
      if (err.status) throw err;
      throw Object.assign(new Error(err.message || 'Error al consultar la entrega'), {
        status: 500,
        code: 'CONSULTA_ENTREGA',
      });
    }
  }

  const resultado = await entregasService.sincronizarEntrega(numero);

  if (!resultado.encontrado) {
    return enriquecerResultadoBusqueda(
      { encontrado: false, sap: null, entregaLocal: null, registro: null },
      numeroNorm,
      bd
    );
  }

  return enriquecerResultadoBusqueda(resultado, numeroNorm, bd);
}

export async function seleccionarEntregaCompleta(tknum, vbeln) {
  const numeroNorm = String(vbeln).trim();
  const bd = await cargarDatosCumplidoDesdeBd(numeroNorm);

  const resultado = await entregasService.seleccionarEntregaDocumento(tknum, vbeln);
  if (!resultado.encontrado) {
    return { encontrado: false };
  }

  return enriquecerResultadoBusqueda(resultado, numeroNorm, bd);
}

export async function subirAdjunto(cumplidoId, archivo, tipo = 'cumplido') {
  const rows = await query(
    `SELECT c.id, c.numero_entrega, c.estado FROM pc_registro_cumplido c WHERE c.id = :id`,
    { id: cumplidoId }
  );
  if (!rows.length) {
    throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
  }
  const cumplido = rows[0];
  if (cumplido.estado !== 'borrador') {
    throw Object.assign(new Error('El registro ya fue completado'), { status: 400 });
  }

  const { archivos: guardados } = await adjuntosService.guardarAdjuntos(
    cumplidoId,
    [{ ...archivo, tipo }],
    cumplido.numero_entrega,
    { sincronizarSapBundle: false }
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM pc_adjunto WHERE registro_cumplido_id = :id`,
    { id: cumplidoId }
  );

  return {
    adjunto: guardados[0],
    totalAdjuntos: Number(countRow?.total || 0),
  };
}

async function validarAdjuntosObligatorios(cumplidoId, modo) {
  const rows = await query(
    `SELECT tipo FROM pc_adjunto WHERE registro_cumplido_id = :id`,
    { id: cumplidoId }
  );
  const tipos = new Set(rows.map((r) => r.tipo));

  if (modo === 'ok') {
    if (!tipos.has('cumplido')) {
      throw Object.assign(
        new Error('Debe subir al menos un documento del cumplido antes de registrar'),
        { status: 400 }
      );
    }
    return;
  }

  const tiposEvidencia = ['ev_lugar', 'ev_captura', 'ev_aviso'];
  const tieneEvidencia = tiposEvidencia.some((tipo) => tipos.has(tipo));
  if (!tieneEvidencia) {
    throw Object.assign(
      new Error('Debe subir al menos una evidencia (lugar, captura o aviso) antes de registrar'),
      { status: 400 }
    );
  }
}

/** Solo permite editar un registro en estado borrador (cada intento nov es un registro nuevo al confirmar) */
async function asegurarRegistroEnBorrador(cumplidoId) {
  const [row] = await query(`SELECT * FROM pc_registro_cumplido WHERE id = :id`, {
    id: cumplidoId,
  });
  if (!row) {
    throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
  }
  if (row.estado === 'borrador') return row;

  throw Object.assign(
    new Error('El registro ya fue completado. Consulte la entrega para iniciar un nuevo intento.'),
    { status: 400 }
  );
}

export async function actualizarBorrador(cumplidoId, datos) {
  await asegurarRegistroEnBorrador(cumplidoId);

  const [actual] = await query(`SELECT transportista, placa, fecha_entrega, hora_entrega, modo FROM pc_registro_cumplido WHERE id = :id`, {
    id: cumplidoId,
  });
  const row = actual || {};
  await query(
    `UPDATE pc_registro_cumplido SET
      transportista = :transportista,
      placa = :placa,
      fecha_entrega = :fechaEntrega,
      hora_entrega = :horaEntrega,
      modo = :modo,
      updated_at = NOW()
     WHERE id = :id`,
    {
      id: cumplidoId,
      transportista:
        datos.transportista !== undefined ? String(datos.transportista || '').trim() : row.transportista,
      placa: datos.placa !== undefined ? String(datos.placa || '').trim() : row.placa,
      fechaEntrega:
        datos.fechaEntrega !== undefined
          ? formatFechaParaApi(datos.fechaEntrega)
          : row.fecha_entrega,
      horaEntrega:
        datos.horaEntrega !== undefined
          ? formatHoraParaApi(datos.horaEntrega)
          : row.hora_entrega,
      modo: datos.modo !== undefined ? datos.modo : row.modo,
    }
  );

  return { id: cumplidoId, estado: 'borrador' };
}

export async function completarRegistro(cumplidoId, datos) {
  const rows = await query(`SELECT * FROM pc_registro_cumplido WHERE id = :id`, { id: cumplidoId });
  if (!rows.length) {
    throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
  }
  const actual = rows[0];
  if (actual.estado === 'completado') {
    throw Object.assign(new Error('Este registro ya fue enviado'), { status: 400 });
  }

  const {
    modo,
    transportista,
    placa,
    fechaEntrega,
    horaEntrega,
    observaciones,
    nIntentos,
    descripcionNovedad,
    terminosAceptados,
  } = datos;
  const estadoResultado = estadoResultadoDesdeModo(modo);

  if (!terminosAceptados) {
    throw Object.assign(new Error('Debe aceptar los términos y condiciones'), { status: 400 });
  }

  if (!formatHoraParaApi(horaEntrega)) {
    throw Object.assign(
      new Error('Debe indicar la hora en datos de entrega (paso 1)'),
      { status: 400 }
    );
  }

  if (modo === 'nov' && !tieneAlgunaMotivoNov(datos)) {
    throw Object.assign(
      new Error('Debe marcar al menos un motivo de novedad en entrega'),
      { status: 400 }
    );
  }

  const errorObservacionSap = modo === 'nov' ? validarObservacionNovSap(datos) : null;
  if (errorObservacionSap) {
    throw Object.assign(new Error(errorObservacionSap), { status: 400 });
  }

  await validarAdjuntosObligatorios(cumplidoId, modo);

  const entrega = await entregasService.obtenerPorNumero(actual.numero_entrega);
  if (!entrega) {
    throw Object.assign(new Error('Debe consultar primero el número de entrega en SAP'), { status: 400 });
  }

  const rowsEntrega = await query(
    `SELECT * FROM pc_registro_cumplido WHERE numero_entrega = :n`,
    { n: actual.numero_entrega }
  );
  const intentosNovPrevios = contarIntentosNovEntrega(rowsEntrega);

  if (modo === 'nov' && intentosNovPrevios >= MAX_VISITAS_NO_CONTESTO) {
    throw Object.assign(
      new Error(
        'Ya se registraron 3 intentos de novedad en entrega. Solo puede registrar entrega exitosa.'
      ),
      { status: 400 }
    );
  }

  const erroresVisita = validarVisitasParaCierre(
    { ...datos, modo, horaEntrega },
    { intentosNovPrevios }
  );
  if (erroresVisita.length) {
    throw Object.assign(
      new Error(`Validación de visitas: ${erroresVisita.join('; ')}`),
      { status: 400 }
    );
  }

  const datosConVisitas = prepararVisitasParaGuardar(
    {
      ...datos,
      modo,
      fechaConfirmacion: datos.fechaConfirmacion || fechaSistema(),
    },
    actual,
    { intentosNovPrevios }
  );
  const visitasParams = bindVisitasSqlParams(datosConVisitas);

  await query(
    `UPDATE pc_registro_cumplido SET
      estado = 'completado',
      modo = :modo,
      estado_resultado = :estadoResultado,
      transportista = :transportista,
      placa = :placa,
      fecha_entrega = :fechaEntrega,
      hora_entrega = :horaEntrega,
      observaciones = :observaciones,
      ${visitasSqlSetClause()},
      ${motivosSqlSetClause()},
      descripcion_novedad = :descripcionNovedad,
      terminos_aceptados = 1,
      completado_at = NOW(),
      sap_estado = 'pendiente'
     WHERE id = :id`,
    {
      id: cumplidoId,
      modo,
      estadoResultado,
      transportista,
      placa,
      fechaEntrega: formatFechaParaApi(fechaEntrega),
      horaEntrega: formatHoraParaApi(horaEntrega),
      observaciones: observaciones || null,
      ...visitasParams,
      ...bindMotivosSqlParams(datos),
      descripcionNovedad: descripcionNovedad || null,
    }
  );

  let syncIntentoSap = null;
  try {
    const observacionIntento = sapService.buildObservacionIntentoSap(modo, {
      ...datos,
      descripcionNovedad: descripcionNovedad ?? datos.descripcionNovedad,
    });
    const sapResult = await sapService.registrarIntentoEntregaSap(actual.numero_entrega, modo, {
      observacion: observacionIntento,
    });
    const textoSap = [sapResult.mensaje, sapResult.logId ? `logId=${sapResult.logId}` : null, sapResult.intento ? `intento=${sapResult.intento}` : null]
      .filter(Boolean)
      .join(' · ');
    await query(
      `UPDATE pc_registro_cumplido SET sap_estado = :estado, sap_mensaje = :mensaje WHERE id = :id`,
      {
        id: cumplidoId,
        estado: sapResult.ok ? 'ok' : 'error',
        mensaje: textoSap.slice(0, 500),
      }
    );
    syncIntentoSap = {
      estado: sapResult.ok ? 'ok' : 'error',
      mensaje: sapResult.mensaje,
      logId: sapResult.logId || null,
      intento: sapResult.intento || null,
      entregado: sapResult.entregado,
      observacion: sapResult.observacion || observacionIntento || null,
      simulado: Boolean(sapResult.simulado),
    };
  } catch (err) {
    await query(
      `UPDATE pc_registro_cumplido SET sap_estado = 'error', sap_mensaje = :mensaje WHERE id = :id`,
      { id: cumplidoId, mensaje: err.message?.slice(0, 500) }
    );
    syncIntentoSap = {
      estado: 'error',
      mensaje: err.message,
      logId: null,
      intento: null,
      entregado: modo === 'ok',
      simulado: false,
    };
  }

  const adjuntos = await query(`SELECT id, estado_sync_sap FROM pc_adjunto WHERE registro_cumplido_id = :id`, {
    id: cumplidoId,
  });

  await query(
    `INSERT INTO pc_auditoria (entidad, entidad_id, accion, detalle)
     VALUES ('pc_registro_cumplido', :id, 'COMPLETAR', :detalle)`,
    {
      id: cumplidoId,
      detalle: JSON.stringify({ numeroEntrega: actual.numero_entrega, modo, adjuntos: adjuntos.length }),
    }
  );

  return {
    id: cumplidoId,
    numeroEntrega: actual.numero_entrega,
    modo,
    estadoResultado,
    adjuntos,
    syncIntentoSap,
  };
}

/** Registro completo: borrador + adjuntos + completado en una sola operación (paso 3) */
export async function crearCumplido(datos, archivos = []) {
  const vbeln = String(datos.numeroEntrega || '').trim();
  if (!vbeln) {
    throw Object.assign(new Error('Falta número de entrega'), { status: 400 });
  }

  if (!config.persistirCumplidos) {
    throw Object.assign(
      new Error('Debe activar PERSISTIR_CUMPLIDOS_MYSQL para registrar cumplidos'),
      { status: 503 }
    );
  }

  const gestionPre = await obtenerGestionVisitas(vbeln);

  if (gestionPre.entregaExitosaCompletada) {
    throw Object.assign(new Error('Esta entrega ya fue registrada como cumplida'), {
      status: 400,
    });
  }

  if (datos.modo === 'nov' && !gestionPre.puedeRegistrarModoNov) {
    throw Object.assign(
      new Error(
        'Ya se registraron 3 intentos de novedad en entrega. Solo puede registrar entrega exitosa.'
      ),
      { status: 400 }
    );
  }

  let entregaLocal;

  if (config.entregasExterna.enabled) {
    const consulta = await entregasService.consultarPorVbeln(vbeln);
    if (!consulta.encontrado) {
      throw Object.assign(new Error(`Entrega "${vbeln}" no encontrada`), { status: 404 });
    }
    entregaLocal = consulta.entregaLocal;
  } else {
    const sync = await entregasService.sincronizarEntrega(vbeln);
    if (!sync.encontrado) {
      throw Object.assign(new Error(`Entrega "${vbeln}" no encontrada en SAP`), { status: 404 });
    }
    entregaLocal = sync.entregaLocal;
  }

  if (!entregaLocal) {
    throw Object.assign(
      new Error('No se pudo preparar la entrega en MySQL. Consulte el número de entrega primero.'),
      { status: 503 }
    );
  }

  const registro = await entregasService.obtenerOCrearBorrador(entregaLocal);
  const cumplidoId = registro.cumplidoId || registro.id;
  const datosConIntentos = {
    ...datos,
    intentosNovPrevios: gestionPre.visitasRegistradas,
    fechaConfirmacion: fechaSistema(),
  };

  let syncSap = null;
  if (archivos.length) {
    const guardado = await adjuntosService.guardarAdjuntos(cumplidoId, archivos, vbeln, {
      sincronizarSapBundle: true,
      datosRegistro: {
        modo: datosConIntentos.modo,
        transportista: datosConIntentos.transportista,
        placa: datosConIntentos.placa,
        ...bindMotivosSqlParams(datosConIntentos),
        visita1Fecha: datos.visita1Fecha,
        visita1Hora: datos.visita1Hora,
        visita2Fecha: datos.visita2Fecha,
        visita2Hora: datos.visita2Hora,
        visita3Fecha: datos.visita3Fecha,
        visita3Hora: datos.visita3Hora,
      },
    });
    syncSap = guardado.syncSap;
  }

  const resultado = await completarRegistro(cumplidoId, datosConIntentos);
  return { ...resultado, syncSap };
}

export function metricasVacias() {
  return {
    exitosas: 0,
    novedades: 0,
    documentos: 0,
    entregasSap: 0,
    tasaExito: null,
    ultimaPlaca: null,
    ultimoRegistro: null,
    fuente: 'estatica',
  };
}

export async function obtenerMetricas() {
  if (!config.metricas.useDb) {
    return metricasVacias();
  }

  try {
    const [stats] = await query(`
      SELECT
        SUM((estado_resultado = 'entrega_exitosa' OR (estado_resultado IS NULL AND modo = 'ok')) AND estado = 'completado') AS exitosas,
        SUM((estado_resultado = 'no_contesto' OR (estado_resultado IS NULL AND modo = 'nov')) AND estado = 'completado') AS no_contesto,
        COUNT(*) AS total
      FROM pc_registro_cumplido WHERE estado = 'completado'
    `);
    const [docs] = await query(`SELECT COUNT(*) AS total FROM pc_adjunto`);
    const [ultimo] = await query(`
      SELECT placa, created_at FROM pc_registro_cumplido
      WHERE estado = 'completado' ORDER BY created_at DESC LIMIT 1
    `);
    const [entregasSap] = await query(`SELECT COUNT(*) AS total FROM pc_entrega_sap`);

    const exitosas = toNum(stats?.exitosas);
    const noContesto = toNum(stats?.no_contesto);
    const total = exitosas + noContesto;

    return toJsonSafe({
      exitosas,
      novedades: noContesto,
      noContesto,
      documentos: toNum(docs?.total),
      entregasSap: toNum(entregasSap?.total),
      tasaExito: total > 0 ? Math.round((exitosas / total) * 100) : null,
      ultimaPlaca: ultimo?.placa || null,
      ultimoRegistro: ultimo?.created_at || null,
    });
  } catch {
    return metricasVacias();
  }
}

export async function obtenerCumplido(id) {
  const rows = await query(`SELECT * FROM pc_registro_cumplido WHERE id = :id`, { id });
  if (!rows.length) return null;
  const adjuntos = await query(
    `SELECT id, tipo, nombre_original, mime_type, tamano_bytes, estado_sync_sap, sap_doc_id, created_at
     FROM pc_adjunto WHERE registro_cumplido_id = :id`,
    { id }
  );
  const entrega = await entregasService.obtenerPorNumero(rows[0].numero_entrega);
  return { ...rows[0], adjuntos, entregaLocal: entrega };
}
