import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import * as sapService from './sap.service.js';
import * as transportesService from './transportes.service.js';
import * as entregasExterna from './entregas-externa.service.js';
import {
  mapEntregaCabecera,
  mapEntregaToSap,
  normalizarTipoEntrega,
  normalizarCliente,
} from '../domain/entrega-display.js';
import {
  buildEntregaSapRow,
  datosConductorDesdeEntrega,
  mapEntregaSapRowToApi,
} from '../domain/entrega-persistence.js';
import { config } from '../config/index.js';
import { toJsonSafe } from '../utils/serialize.js';
import {
  contarIntentosNovEntrega,
  esRegistroEntregaExitosa,
  puedeRegistrarModoNov,
} from '../domain/visitas-no-contesto.js';

const ENTREGA_SAP_UPDATE_FIELDS = `
  pedido = :pedido, cliente = :cliente, direccion = :direccion, ciudad = :ciudad,
  region = :region, estado_logistico = :estado_logistico,
  transportista_asignado = :transportista_asignado, placa_asignada = :placa_asignada,
  fecha_planificada = :fecha_planificada, volumen = :volumen, peso = :peso,
  fuente_sap = :fuente_sap, tknum = :tknum, tipo_entrega = :tipo_entrega,
  codigo_cliente = :codigo_cliente, ruta = :ruta, tipo_transporte = :tipo_transporte,
  clase_medio_transporte = :clase_medio_transporte, procesamiento_especial = :procesamiento_especial,
  nombre_transporte = :nombre_transporte, conductor_nombre = :conductor_nombre,
  conductor_documento = :conductor_documento, conductor_telefono = :conductor_telefono,
  empresa_transportista = :empresa_transportista,
  empresa_transportista_codigo = :empresa_transportista_codigo,
  placa_sap = :placa_sap, fecha_documento = :fecha_documento, items_count = :items_count,
  datos_sap = :datos_sap, api_consultada_at = NOW(), sincronizado_at = NOW()
`;

function estadoResultadoDesdeModo(modo) {
  return modo === 'ok' ? 'entrega_exitosa' : modo === 'nov' ? 'no_contesto' : null;
}

function buildInNamedParams(values, prefix = 'p') {
  const params = {};
  const placeholders = values.map((v, i) => {
    const key = `${prefix}${i}`;
    params[key] = v;
    return `:${key}`;
  });
  return { placeholders: placeholders.join(', '), params };
}

async function enriquecerEntregasConProceso(entregas = []) {
  if (!Array.isArray(entregas) || entregas.length === 0) return entregas;

  const numeros = [...new Set(entregas.map((e) => String(e?.vbeln || e?.numero || '').trim()).filter(Boolean))];
  if (!numeros.length) return entregas;

  const inNumeros = buildInNamedParams(numeros, 'n');

  const registros = await query(
    `SELECT id, numero_entrega, estado, modo, estado_resultado, sap_estado, created_at, updated_at,
            completado_at, visita_1_fecha, visita_1_hora, visita_2_fecha, visita_2_hora,
            visita_3_fecha, visita_3_hora, n_intentos
     FROM pc_registro_cumplido
     WHERE numero_entrega IN (${inNumeros.placeholders})
     ORDER BY created_at DESC`,
    inNumeros.params
  );

  const porNumeroRows = new Map();
  for (const row of registros) {
    const num = row.numero_entrega;
    if (!porNumeroRows.has(num)) porNumeroRows.set(num, []);
    porNumeroRows.get(num).push(row);
  }

  const porNumero = new Map();
  for (const num of numeros) {
    const rowsNum = porNumeroRows.get(num) || [];
    const borrador = rowsNum.find((r) => r.estado === 'borrador');
    const exitosa = rowsNum.find((r) => r.estado === 'completado' && esRegistroEntregaExitosa(r));
    const ultimo = rowsNum[0] || null;
    porNumero.set(num, borrador || exitosa || ultimo);
  }

  const adjuntos = await query(
    `SELECT c.numero_entrega, COUNT(a.id) AS total_adjuntos
     FROM pc_registro_cumplido c
     INNER JOIN pc_adjunto a ON a.registro_cumplido_id = c.id
     WHERE c.numero_entrega IN (${inNumeros.placeholders}) AND c.estado = 'completado'
     GROUP BY c.numero_entrega`,
    inNumeros.params
  );
  const adjuntosPorNumero = new Map(
    adjuntos.map((r) => [String(r.numero_entrega), Number(r.total_adjuntos || 0)])
  );

  return entregas.map((item) => {
    const numero = String(item?.vbeln || item?.numero || '').trim();
    const reg = porNumero.get(numero);
    const totalAdjuntos = adjuntosPorNumero.get(numero) || 0;
    const tieneAdjuntos = totalAdjuntos > 0;
    const cumplida = Boolean(reg && reg.estado === 'completado');
    const estadoProceso = cumplida ? 'cumplida' : 'sin_iniciar';
    const rowsNum = porNumeroRows.get(numero) || [];
    const visitasRegistradas = contarIntentosNovEntrega(rowsNum);
    const puedeNov = puedeRegistrarModoNov(rowsNum);

    return {
      ...item,
      tieneAdjuntos,
      totalAdjuntos,
      cumplida,
      estadoProceso,
      visitasRegistradas,
      visitasMax: 3,
      puedeRegistrarModoNov: puedeNov,
      estadoResultado: reg?.estado_resultado || estadoResultadoDesdeModo(reg?.modo),
      sapEstado: reg?.sap_estado || null,
      ultimoRegistroAt: reg?.updated_at || reg?.created_at || null,
      registroId: reg?.id || null,
    };
  });
}

export async function obtenerPorNumero(numero) {
  const rows = await query(
    `SELECT * FROM pc_entrega_sap WHERE numero_entrega = :numero LIMIT 1`,
    { numero: String(numero).trim() }
  );
  return mapEntregaSapRowToApi(rows[0]);
}

/** Persiste snapshot de API 1 + 2 en pc_entrega_sap */
export async function guardarDesdeSap(sapData, contexto = {}) {
  const row = buildEntregaSapRow(sapData, contexto);
  const existente = await obtenerPorNumero(row.numero_entrega);

  if (existente) {
    await query(
      `UPDATE pc_entrega_sap SET ${ENTREGA_SAP_UPDATE_FIELDS} WHERE numero_entrega = :numero_entrega`,
      row
    );
    return obtenerPorNumero(row.numero_entrega);
  }

  const id = uuidv4();
  await query(
    `INSERT INTO pc_entrega_sap (
      id, numero_entrega, pedido, cliente, direccion, ciudad, region, estado_logistico,
      transportista_asignado, placa_asignada, fecha_planificada, volumen, peso, fuente_sap,
      tknum, tipo_entrega, codigo_cliente, ruta, tipo_transporte, clase_medio_transporte,
      procesamiento_especial, nombre_transporte, conductor_nombre, conductor_documento,
      conductor_telefono, empresa_transportista, empresa_transportista_codigo, placa_sap,
      fecha_documento, items_count, datos_sap, api_consultada_at
    ) VALUES (
      :id, :numero_entrega, :pedido, :cliente, :direccion, :ciudad, :region, :estado_logistico,
      :transportista_asignado, :placa_asignada, :fecha_planificada, :volumen, :peso, :fuente_sap,
      :tknum, :tipo_entrega, :codigo_cliente, :ruta, :tipo_transporte, :clase_medio_transporte,
      :procesamiento_especial, :nombre_transporte, :conductor_nombre, :conductor_documento,
      :conductor_telefono, :empresa_transportista, :empresa_transportista_codigo, :placa_sap,
      :fecha_documento, :items_count, :datos_sap, NOW()
    )`,
    { id, ...row }
  );
  return obtenerPorNumero(row.numero_entrega);
}

/**
 * Flujo integrado:
 * 1) API entregas/{vbeln} → entrega, transporte (tknum), items
 * 2) API transportes/{tknum} → listado entregas pendientes
 * 3) Persiste snapshot de entrega en pc_entrega_sap (sin registro de cumplido hasta el paso 3)
 */
export async function consultarPorVbeln(vbeln) {
  try {
    return await consultarPorVbelnInterno(vbeln);
  } catch (err) {
    console.error('[consultarPorVbeln]', err);
    if (err.status) throw err;
    throw Object.assign(new Error(err.message || 'Error al consultar la entrega'), {
      status: 500,
      code: 'CONSULTA_ENTREGA',
    });
  }
}

async function consultarPorVbelnInterno(vbeln) {
  const doc = await entregasExterna.consultarEntrega(vbeln);
  if (!doc) {
    return { encontrado: false, tipo: 'entrega' };
  }

  const tknum = doc.transporte.tknum;
  const ruta = await transportesService.consultarTransporte(tknum);
  if (!ruta) {
    throw Object.assign(
      new Error(`Transporte ${tknum} no encontrado para la entrega ${vbeln}`),
      { status: 404 }
    );
  }

  const vbelnNorm = String(vbeln).trim();
  let entregaRaw = (ruta.entregasRaw || []).find((e) => String(e.vbeln) === vbelnNorm);

  if (!entregaRaw) {
    entregaRaw = {
      vbeln: doc.entrega.vbeln,
      ruta: doc.transporte.ruta,
      fecha_creacion: doc.entrega.fecha_creacion,
      cliente:
        typeof doc.entrega.cliente === 'object'
          ? doc.entrega.cliente
          : { codigo: doc.entrega.cliente, nombre: null, direccion: null, ciudad: null },
    };
  }

  const transporteRaw = ruta.transporteRaw || ruta.transporte;
  const sap = mapEntregaToSap(entregaRaw, transporteRaw);
  sap.fuente = 'ENTREGAS_TRANSPORTES_API';
  sap.tipoEntrega = normalizarTipoEntrega(doc.entrega.tipo_entrega);
  sap.items = doc.items;
  const sapFront = { ...sap };
  delete sapFront.entregaRaw;
  delete sapFront.transporteRaw;

  const transporte = ruta.transporte;
  const cliente = normalizarCliente(entregaRaw.cliente || doc.entrega.cliente);
  const entregaVista = mapEntregaCabecera(doc.entrega);

  let entregaLocal = null;

  if (config.persistirCumplidos) {
    try {
      entregaLocal = await guardarDesdeSap(sap, {
        entrega: doc.entrega,
        transporteRaw,
        items: doc.items,
      });
      try {
        await query(
          `INSERT INTO pc_auditoria (entidad, entidad_id, accion, detalle)
           VALUES ('pc_entrega_sap', :id, 'CONSULTA_ENTREGA_TRANSPORTE', :detalle)`,
          {
            id: entregaLocal.id,
            detalle: JSON.stringify({ vbeln: vbelnNorm, tknum, items: doc.items.length }),
          }
        );
      } catch (audErr) {
        console.warn('[consultarPorVbeln] auditoría:', audErr.message);
      }
    } catch (dbErr) {
      console.error('[consultarPorVbeln] MySQL:', dbErr.message);
      throw Object.assign(
        new Error(
          `Datos de entrega obtenidos, pero no se pudo guardar en MySQL: ${dbErr.message}. ` +
            'Revise tablas (pc_entrega_sap) o use PERSISTIR_CUMPLIDOS_MYSQL=false para solo consultar.'
        ),
        { status: 503, code: 'MYSQL_SAVE' }
      );
    }
  }

  const entregasConProceso = config.persistirCumplidos
    ? await enriquecerEntregasConProceso(ruta.entregas)
    : ruta.entregas;

  return toJsonSafe({
    encontrado: true,
    tipo: 'entrega',
    vbeln: vbelnNorm,
    tknum,
    entrega: doc.entrega,
    entregaVista,
    cliente,
    items: doc.items,
    transporte,
    entregas: entregasConProceso,
    totalEntregas: ruta.totalEntregas,
    sap: sapFront,
    entregaLocal,
    registro: null,
    guardadoEnMysql: Boolean(entregaLocal),
    gestionVisitas: null,
  });
}

/**
 * Respuesta mínima desde MySQL (solo respaldo si la API externa no está disponible).
 * El flujo normal de consulta siempre llama primero a la API de entregas.
 */
export async function consultarDesdeCacheMysql(vbeln, opts = {}) {
  const vbelnNorm = String(vbeln).trim();
  const row = await query(
    `SELECT * FROM pc_entrega_sap WHERE numero_entrega = :n LIMIT 1`,
    { n: vbelnNorm }
  );
  if (!row.length) {
    return { encontrado: false, tipo: 'entrega' };
  }

  const entregaLocal = mapEntregaSapRowToApi(row[0]);
  let datosSap = {};
  try {
    datosSap =
      typeof row[0].datos_sap === 'string' ? JSON.parse(row[0].datos_sap) : row[0].datos_sap || {};
  } catch {
    datosSap = {};
  }

  const items = datosSap.items || [];
  const transporte = datosSap.transporteApi
    ? {
        tknum: row[0].tknum,
        ruta: row[0].ruta,
        placa: row[0].placa_sap,
        transportista: { nombre: row[0].empresa_transportista || row[0].transportista_asignado },
      }
    : {
        tknum: row[0].tknum,
        ruta: row[0].ruta,
        placa: row[0].placa_sap,
      };

  const cliente = normalizarCliente({
    codigo: row[0].codigo_cliente,
    nombre: row[0].cliente,
    direccion: row[0].direccion,
    ciudad: row[0].ciudad,
  });

  const entregaVista = mapEntregaCabecera({
    vbeln: vbelnNorm,
    fecha_creacion: row[0].fecha_documento,
    tipo_entrega: row[0].tipo_entrega,
  });

  const entregaLista = {
    vbeln: vbelnNorm,
    numero: vbelnNorm,
    cliente: row[0].cliente,
    direccion: row[0].direccion,
    ciudad: row[0].ciudad,
    ruta: row[0].ruta,
    estado: row[0].estado_logistico,
  };

  const entregas = config.persistirCumplidos
    ? await enriquecerEntregasConProceso([entregaLista])
    : [entregaLista];

  return {
    encontrado: true,
    tipo: 'entrega',
    vbeln: vbelnNorm,
    tknum: row[0].tknum,
    entrega: datosSap.entregaApi || entregaVista,
    entregaVista,
    cliente,
    items,
    transporte,
    entregas,
    totalEntregas: 1,
    sap: entregaLocal,
    entregaLocal,
    registro: null,
    guardadoEnMysql: true,
    soloLectura: Boolean(opts.soloLectura),
    motivoSoloLectura: opts.motivoSoloLectura || null,
    gestionVisitas: opts.gestionVisitas || null,
    mensajeLocal:
      opts.gestionVisitas?.entregaFallidaCompletada
        ? 'Novedad en entrega ya registrada. Datos cargados desde el portal (sin consultar API externa).'
        : 'Datos cargados desde el portal.',
  };
}

/** Solo API 1 — para modal de ítems sin cambiar la sesión activa */
export async function obtenerDetalleEntrega(vbeln) {
  const doc = await entregasExterna.consultarEntrega(vbeln);
  if (!doc) return { encontrado: false };
  return {
    encontrado: true,
    entrega: doc.entrega,
    transporte: doc.transporte,
    items: doc.items,
  };
}

/**
 * Cambia la entrega activa dentro del mismo transporte (reutiliza flujo completo).
 */
export async function seleccionarEntregaDocumento(tknum, vbeln) {
  const doc = await entregasExterna.consultarEntrega(vbeln);
  if (!doc) {
    return { encontrado: false };
  }
  if (String(doc.transporte.tknum) !== String(tknum).trim()) {
    throw Object.assign(
      new Error(`La entrega ${vbeln} no pertenece al transporte ${tknum}`),
      { status: 400 }
    );
  }
  return consultarPorVbeln(vbeln);
}

export async function sincronizarEntrega(numero) {
  const sap = await sapService.buscarEntregaSap(numero);
  if (!sap) {
    return { encontrado: false, sap: null, entregaLocal: null, registro: null };
  }

  const entregaLocal = await guardarDesdeSap(sap);

  await query(
    `INSERT INTO pc_auditoria (entidad, entidad_id, accion, detalle)
     VALUES ('pc_entrega_sap', :id, 'SYNC_SAP', :detalle)`,
    {
      id: entregaLocal.id,
      detalle: JSON.stringify({ numero: entregaLocal.numeroEntrega, fuente: sap.fuente }),
    }
  );

  return {
    encontrado: true,
    tipo: 'sap',
    sap,
    entregaLocal,
    registro: null,
  };
}

function mapRegistroBorradorResponse(row, datosApi) {
  return {
    cumplidoId: row.id,
    id: row.id,
    estado: row.estado,
    adjuntosCount: Number(row.adjuntos_count || 0),
    transportista: row.transportista ?? datosApi.transportista,
    placa: row.placa ?? datosApi.placa,
    fechaEntrega: row.fecha_entrega ?? datosApi.fechaEntrega,
    horaEntrega: row.hora_entrega ?? null,
  };
}

export async function obtenerOCrearBorrador(entregaLocal, tknum = null) {
  const numero = entregaLocal.numeroEntrega;
  const tk = tknum || entregaLocal.tknum || null;
  const datosApi = datosConductorDesdeEntrega(entregaLocal);
  const fechaBorrador = datosApi.fechaEntrega || new Date().toISOString().slice(0, 10);
  /** Hora de entrega: solo la diligencia el conductor en paso 1 (no desde transporte/API) */
  const horaBorrador = null;

  let registroId = null;

  const [borradorRow] = await query(
    `SELECT c.id FROM pc_registro_cumplido c
     WHERE c.numero_entrega = :numero AND c.estado = 'borrador'
     ORDER BY c.updated_at DESC LIMIT 1`,
    { numero }
  );
  if (borradorRow) {
    registroId = borradorRow.id;
  } else {
    const rowsEntrega = await query(
      `SELECT id, estado, modo, estado_resultado FROM pc_registro_cumplido
       WHERE numero_entrega = :numero`,
      { numero }
    );
    if (rowsEntrega.some((r) => r.estado === 'completado' && esRegistroEntregaExitosa(r))) {
      registroId = null;
    }
  }

  if (registroId) {
    await query(
      `UPDATE pc_registro_cumplido SET
        entrega_sap_id = :entregaSapId,
        tknum = :tknum,
        transportista = :transportista,
        placa = :placa,
        fecha_entrega = COALESCE(fecha_entrega, :fechaEntrega),
        updated_at = NOW()
       WHERE id = :id`,
      {
        id: registroId,
        entregaSapId: entregaLocal.id,
        tknum: tk,
        transportista: datosApi.transportista,
        placa: datosApi.placa,
        fechaEntrega: fechaBorrador,
      }
    );
    const [actualizado] = await query(
      `SELECT c.id, c.estado, c.transportista, c.placa, c.fecha_entrega, c.hora_entrega,
        (SELECT COUNT(*) FROM pc_adjunto a WHERE a.registro_cumplido_id = c.id) AS adjuntos_count
       FROM pc_registro_cumplido c WHERE c.id = :id`,
      { id: registroId }
    );
    return mapRegistroBorradorResponse(actualizado, datosApi);
  }

  const id = uuidv4();
  await query(
    `INSERT INTO pc_registro_cumplido (
      id, entrega_sap_id, numero_entrega, tknum, estado, transportista, placa, fecha_entrega, hora_entrega
    ) VALUES (
      :id, :entregaSapId, :numero, :tknum, 'borrador', :transportista, :placa, :fechaEntrega, :horaEntrega
    )`,
    {
      id,
      entregaSapId: entregaLocal.id,
      numero,
      tknum: tk,
      transportista: datosApi.transportista,
      placa: datosApi.placa,
      fechaEntrega: fechaBorrador,
      horaEntrega: null,
    }
  );

  return mapRegistroBorradorResponse(
    {
      id,
      estado: 'borrador',
      transportista: datosApi.transportista,
      placa: datosApi.placa,
      fecha_entrega: fechaBorrador,
      hora_entrega: null,
      adjuntos_count: 0,
    },
    datosApi
  );
}
