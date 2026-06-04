import { parseFechaTransporte } from './entrega-display.js';
import { horaEntregaDesdeEntregaLocal } from './fecha-hora-entrega.js';

/**
 * Fila persistible en pc_entrega_sap (columnas indexadas + JSON completo).
 */
export function buildEntregaSapRow(sap, { entrega, transporteRaw, items = [] } = {}) {
  const itemsList = items.length ? items : sap.items || [];
  const payloadJson = {
    ...sap,
    items: itemsList,
    entregaApi: entrega || sap.entregaApi,
    transporteApi: transporteRaw || sap.transporteApi,
    consultadoAt: new Date().toISOString(),
  };

  return {
    numero_entrega: sap.numeroEntrega,
    pedido: sap.pedido || sap.numeroEntrega,
    cliente: sap.cliente || null,
    direccion: sap.direccion || null,
    ciudad: sap.ciudad || null,
    estado_logistico: sap.estadoLogistico || 'PENDIENTE',
    transportista_asignado: sap.transportistaEmpresa || sap.transportistaAsignado || null,
    placa_asignada: sap.placaAsignada || null,
    fecha_planificada: sap.fechaPlanificada || null,
    volumen: sap.volumen || null,
    peso: sap.peso || null,
    fuente_sap: sap.fuente || 'ENTREGAS_TRANSPORTES_API',
    tknum: sap.tknum || null,
    tipo_entrega: sap.tipoEntrega || entrega?.tipo_entrega || null,
    codigo_cliente: sap.codigoCliente || null,
    region: sap.region || null,
    ruta: sap.ruta || null,
    tipo_transporte: sap.tipoTransporte || null,
    clase_medio_transporte: sap.claseMedioTransporte || null,
    procesamiento_especial: sap.procesamientoEspecial || null,
    nombre_transporte: sap.nombreTransporte || null,
    conductor_nombre: sap.conductorNombre || null,
    conductor_documento: sap.documentoConductor || null,
    conductor_telefono: sap.telefonoConductor || null,
    empresa_transportista: sap.transportistaEmpresa || null,
    empresa_transportista_codigo: sap.transportistaCodigo || null,
    placa_sap: sap.placaAsignada || null,
    fecha_documento:
      parseFechaTransporte(entrega?.fecha_creacion) || sap.fechaPlanificada || null,
    items_count: itemsList.length,
    datos_sap: JSON.stringify(payloadJson),
  };
}

export function mapEntregaSapRowToApi(row) {
  if (!row) return null;
  let datosSap = {};
  try {
    datosSap = typeof row.datos_sap === 'string' ? JSON.parse(row.datos_sap) : row.datos_sap || {};
  } catch {
    datosSap = {};
  }
  return {
    id: row.id,
    numeroEntrega: row.numero_entrega,
    pedido: row.pedido,
    cliente: row.cliente,
    direccion: row.direccion,
    ciudad: row.ciudad,
    region: row.region,
    codigoCliente: row.codigo_cliente,
    estadoLogistico: row.estado_logistico,
    transportistaAsignado: row.transportista_asignado,
    placaAsignada: row.placa_asignada,
    fechaPlanificada: row.fecha_planificada,
    tknum: row.tknum,
    tipoEntrega: row.tipo_entrega,
    ruta: row.ruta,
    tipoTransporte: row.tipo_transporte,
    nombreTransporte: row.nombre_transporte,
    conductorNombre: row.conductor_nombre,
    transportistaEmpresa: row.empresa_transportista,
    placaSap: row.placa_sap || row.placa_asignada,
    itemsCount: row.items_count,
    apiConsultadaAt: row.api_consultada_at,
    volumen: row.volumen,
    peso: row.peso,
    sincronizadoAt: row.sincronizado_at,
    ...datosSap,
  };
}

/** Valores de empresa transportista y placa desde la API para el borrador del conductor */
export function datosConductorDesdeEntrega(entregaLocal) {
  if (!entregaLocal) {
    return { transportista: '', placa: '', fechaEntrega: null, horaEntrega: null };
  }
  const transportista =
    entregaLocal.transportistaEmpresa ||
    entregaLocal.transportistaAsignado ||
    entregaLocal.empresa_transportista ||
    '';
  const placa =
    entregaLocal.placaAsignada || entregaLocal.placaSap || entregaLocal.placa_sap || '';
  const fechaEntrega =
    entregaLocal.fechaPlanificada ||
    entregaLocal.fecha_planificada ||
    null;
  const horaEntrega = horaEntregaDesdeEntregaLocal(entregaLocal);

  return {
    transportista: String(transportista).trim(),
    placa: String(placa).trim(),
    fechaEntrega,
    horaEntrega,
  };
}
