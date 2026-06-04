/**
 * Mapeo de respuestas SAP → vistas para API/frontend.
 * Regla: mostrar *_descripcion; los códigos sin descripción son fallback.
 */

export function pickDescripcion(codigo, descripcion) {
  const d = descripcion != null ? String(descripcion).trim() : '';
  if (d) return d;
  const c = codigo != null ? String(codigo).trim() : '';
  return c || null;
}

export function normalizarTipoEntrega(tipoEntrega) {
  if (!tipoEntrega) return null;
  if (typeof tipoEntrega === 'object') {
    return pickDescripcion(tipoEntrega.codigo, tipoEntrega.descripcion);
  }
  return String(tipoEntrega).trim() || null;
}

/** Convierte DD.MM.YYYY a YYYY-MM-DD */
export function parseFechaTransporte(fecha) {
  if (!fecha) return null;
  const m = String(fecha).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function normalizarCliente(cliente) {
  if (!cliente) return null;
  if (typeof cliente === 'string') {
    return { codigo: cliente, nombre: null, direccion: null, ciudad: null, region: null };
  }
  return {
    codigo: cliente.codigo ?? null,
    nombre: cliente.nombre ?? null,
    direccion: cliente.direccion ?? null,
    ciudad: cliente.ciudad ?? null,
    region: cliente.region ?? null,
  };
}

export function mapEntregaCabecera(entrega) {
  if (!entrega) return null;
  return {
    vbeln: entrega.vbeln,
    tipoEntrega: normalizarTipoEntrega(entrega.tipo_entrega),
    fechaCreacion: entrega.fecha_creacion ?? null,
    cliente: normalizarCliente(entrega.cliente),
  };
}

export function mapTransporteVista(raw) {
  if (!raw) return null;
  const fechaPlanificada = parseFechaTransporte(raw.fecha_inicio_ruta || raw.fecha_creacion);
  return {
    tknum: raw.tknum,
    placa: raw.placa ?? null,
    tipoTransporte: pickDescripcion(raw.tipo_transporte, raw.tipo_transporte_descripcion),
    ruta: pickDescripcion(raw.ruta, raw.ruta_descripcion),
    procesamientoEspecial: pickDescripcion(
      raw.procesamiento_especial,
      raw.procesamiento_especial_descripcion
    ),
    claseMedioTransporte: pickDescripcion(
      raw.clase_medio_transporte,
      raw.clase_medio_transporte_descripcion
    ),
    nombreTransporte: raw.nombre_transporte ?? null,
    conductor: raw.conductor
      ? {
          nombre: raw.conductor.nombre ?? null,
          documento: raw.conductor.documento ?? null,
          telefono: raw.conductor.telefono ?? null,
        }
      : null,
    transportista: raw.transportista
      ? {
          codigo: raw.transportista.codigo ?? null,
          nombre: raw.transportista.nombre ?? null,
        }
      : null,
    fechaCreacion: raw.fecha_creacion ?? null,
    horaCreacion: raw.hora_creacion ?? null,
    fechaInicioRuta: raw.fecha_inicio_ruta ?? null,
    horaInicioRuta: raw.hora_inicio_ruta ?? null,
    fechaPlanificada,
  };
}

export function mapEntregaListaItem(entrega, transporte) {
  const cliente = normalizarCliente(entrega.cliente);
  const rutaEntrega = pickDescripcion(entrega.ruta, entrega.ruta_descripcion);
  const rutaTransporte = transporte?.ruta_descripcion || transporte?.ruta || null;
  return {
    id: entrega.vbeln,
    vbeln: entrega.vbeln,
    numero: entrega.vbeln,
    tknum: transporte.tknum,
    ruta: rutaTransporte || rutaEntrega,
    fechaCreacion: entrega.fecha_creacion,
    cliente: cliente?.nombre || '',
    direccion: cliente?.direccion || '',
    ciudad: cliente?.ciudad || '',
    codigoCliente: cliente?.codigo || '',
    region: cliente?.region || '',
    estado: 'PENDIENTE',
    transportistaEmpresa: transporte.transportista?.nombre || '',
    conductor: transporte.conductor?.nombre || '',
    placa: transporte.placa || '',
    clienteDetalle: cliente,
  };
}

export function mapEntregaToSap(entrega, transporte) {
  const cliente = normalizarCliente(entrega.cliente);
  const fecha =
    parseFechaTransporte(entrega.fecha_creacion) ||
    parseFechaTransporte(transporte.fecha_inicio_ruta) ||
    parseFechaTransporte(transporte.fecha_creacion);

  return {
    numeroEntrega: entrega.vbeln,
    pedido: entrega.vbeln,
    cliente: cliente?.nombre ?? null,
    direccion: cliente?.direccion ?? null,
    ciudad: cliente?.ciudad ?? null,
    codigoCliente: cliente?.codigo ?? null,
    region: cliente?.region ?? null,
    estadoLogistico: 'PENDIENTE',
    transportistaAsignado: transporte.transportista?.nombre || transporte.conductor?.nombre || null,
    transportistaEmpresa: transporte.transportista?.nombre ?? null,
    transportistaCodigo: transporte.transportista?.codigo ?? null,
    placaAsignada: transporte.placa ?? null,
    fechaPlanificada: fecha,
    fuente: 'TRANSPORTES_API',
    tknum: transporte.tknum,
    ruta:
      pickDescripcion(entrega.ruta, entrega.ruta_descripcion) ||
      pickDescripcion(transporte.ruta, transporte.ruta_descripcion),
    tipoTransporte: pickDescripcion(transporte.tipo_transporte, transporte.tipo_transporte_descripcion),
    procesamientoEspecial: pickDescripcion(
      transporte.procesamiento_especial,
      transporte.procesamiento_especial_descripcion
    ),
    claseMedioTransporte: pickDescripcion(
      transporte.clase_medio_transporte,
      transporte.clase_medio_transporte_descripcion
    ),
    nombreTransporte: transporte.nombre_transporte ?? null,
    documentoConductor: transporte.conductor?.documento ?? null,
    telefonoConductor: transporte.conductor?.telefono ?? null,
    conductorNombre: transporte.conductor?.nombre ?? null,
    entregaRaw: entrega,
    transporteRaw: transporte,
  };
}
