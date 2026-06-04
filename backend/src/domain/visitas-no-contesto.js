import {
  fechaHoraVisitaDesdeRegistro,
  fechaSistema,
  formatFechaParaApi,
  formatHoraParaApi,
} from './fecha-hora-entrega.js';
import { labelsMotivosDesdeRegistro } from './motivos-no-contesto.js';

/** Hasta 3 intentos «no contestó» por número de entrega (un registro completado por intento) */
export const MAX_VISITAS_NO_CONTESTO = 3;

export const VISITAS_COLUMNAS = [
  { numero: 1, fechaKey: 'visita1Fecha', horaKey: 'visita1Hora', colFecha: 'visita_1_fecha', colHora: 'visita_1_hora' },
  { numero: 2, fechaKey: 'visita2Fecha', horaKey: 'visita2Hora', colFecha: 'visita_2_fecha', colHora: 'visita_2_hora' },
  { numero: 3, fechaKey: 'visita3Fecha', horaKey: 'visita3Hora', colFecha: 'visita_3_fecha', colHora: 'visita_3_hora' },
];

/** Hora común del paso 1 (pc_registro_cumplido.hora_entrega) */
export function horaEntregaDelRegistro(registro = {}) {
  return formatHoraParaApi(registro?.hora_entrega ?? registro?.horaEntrega);
}

/** Fecha del intento + hora del intento o la de datos de entrega (paso 1) */
export function visitaTieneDatos(fecha, hora, horaEntregaFallback = null) {
  const f = formatFechaParaApi(fecha);
  const h =
    formatHoraParaApi(hora) ||
    horaEntregaDelRegistro({ hora_entrega: horaEntregaFallback }) ||
    formatHoraParaApi(horaEntregaFallback);
  return Boolean(f && h);
}

function resolverFechaHoraVisita(registro, colFecha, colHora, fechaKey, horaKey) {
  const fecha = registro[colFecha] ?? registro[fechaKey] ?? null;
  const horaCol = registro[colHora] ?? registro[horaKey] ?? null;
  const horaComun = horaEntregaDelRegistro(registro);
  const fechaFmt = formatFechaParaApi(fecha);
  const horaFmt = formatHoraParaApi(horaCol) || horaComun;
  return { fechaFmt, horaFmt, registrada: Boolean(fechaFmt && horaFmt) };
}

/** @deprecated Use fechaHoraVisitaDesdeRegistro */
export function fechaHoraVisitaAhora() {
  return fechaHoraVisitaDesdeRegistro({});
}

export function esRegistroEntregaNov(registro = {}) {
  return registro.modo === 'nov' || registro.estado_resultado === 'no_contesto';
}

export function esRegistroEntregaExitosa(registro = {}) {
  return registro.estado_resultado === 'entrega_exitosa' || registro.modo === 'ok';
}

export function esRegistroNovCompletado(registro = {}) {
  return registro.estado === 'completado' && esRegistroEntregaNov(registro);
}

/** Registros nov cerrados de una entrega, orden cronológico */
export function filtrarRegistrosNovCompletados(rows = []) {
  return rows
    .filter((r) => esRegistroNovCompletado(r))
    .sort((a, b) => {
      const ta = new Date(a.completado_at || a.created_at || 0).getTime();
      const tb = new Date(b.completado_at || b.created_at || 0).getTime();
      return ta - tb;
    });
}

/**
 * Total de intentos nov en la entrega.
 * Modelo nuevo: 1 fila completada = 1 intento (visita_1).
 * Legado: varias columnas visita_N en una sola fila.
 */
export function contarIntentosNovEntrega(rows = []) {
  const novs = filtrarRegistrosNovCompletados(rows);
  let total = 0;
  for (const r of novs) {
    const enFila = contarVisitasEnRegistro(r);
    total += enFila > 0 ? enFila : 1;
  }
  return Math.min(total, MAX_VISITAS_NO_CONTESTO);
}

/** Visitas guardadas en una fila (legado multi-columna o un intento en visita_1) */
export function contarVisitasEnRegistro(registro = {}) {
  if (!registro) return 0;
  const horaComun = horaEntregaDelRegistro(registro);
  let n = 0;
  for (const v of VISITAS_COLUMNAS) {
    const fecha = registro[v.colFecha] ?? registro[v.fechaKey];
    const hora = registro[v.colHora] ?? registro[v.horaKey];
    if (visitaTieneDatos(fecha, hora, horaComun)) n += 1;
  }
  if (n > 0) return n;
  const intentos = Number(registro.n_intentos);
  if (intentos > 0) return Math.min(intentos, MAX_VISITAS_NO_CONTESTO);
  return 0;
}

/** @deprecated Alias de contarVisitasEnRegistro para compatibilidad */
export function contarVisitasRegistradas(registro = {}) {
  return contarVisitasEnRegistro(registro);
}

/** Historial de intentos a partir de varios registros completados */
export function mapVisitasHistorialDesdeRegistros(registrosNov = []) {
  const ordenados = filtrarRegistrosNovCompletados(registrosNov);
  const acumulado = [];

  for (const reg of ordenados) {
    const enFila = mapVisitasDesdeRegistro(reg).filter((v) => v.registrada);
    if (enFila.length) {
      for (const v of enFila) {
        acumulado.push({
          ...v,
          registroId: reg.id,
          motivosLabels: labelsMotivosDesdeRegistro(reg),
        });
      }
    } else {
      const { fechaFmt, horaFmt } = resolverFechaHoraVisita(
        reg,
        'visita_1_fecha',
        'visita_1_hora',
        'visita1Fecha',
        'visita1Hora'
      );
      if (fechaFmt) {
        acumulado.push({
          numero: acumulado.length + 1,
          fecha: fechaFmt,
          hora: horaFmt,
          registrada: true,
          registroId: reg.id,
          motivosLabels: labelsMotivosDesdeRegistro(reg),
        });
      }
    }
  }

  return acumulado.slice(0, MAX_VISITAS_NO_CONTESTO).map((v, i) => ({
    ...v,
    numero: i + 1,
  }));
}

export function puedeRegistrarModoNov(rows = []) {
  if (rows.some((r) => r.estado === 'completado' && esRegistroEntregaExitosa(r))) return false;
  return contarIntentosNovEntrega(rows) < MAX_VISITAS_NO_CONTESTO;
}

/** @deprecated Usar contarIntentosNovEntrega sobre todas las filas de la entrega */
export function registroNovPuedeContinuarIntentos(registro = {}, rows = null) {
  if (Array.isArray(rows)) return puedeRegistrarModoNov(rows);
  if (!registro || !esRegistroEntregaNov(registro)) return false;
  if (esRegistroEntregaExitosa(registro)) return false;
  return contarVisitasEnRegistro(registro) < MAX_VISITAS_NO_CONTESTO;
}

export function prepararVisitasParaGuardar(datos = {}, registro = null, opts = {}) {
  const intentosPrev =
    Number(opts.intentosNovPrevios ?? datos.intentosNovPrevios ?? datos.nIntentosPrevios) || 0;

  const horaComun =
    formatHoraParaApi(datos.horaEntrega) || horaEntregaDelRegistro(registro || {});

  if (datos.modo === 'ok') {
    const fechaVisita = formatFechaParaApi(datos.fechaConfirmacion) || fechaSistema();
    return {
      visita1Fecha: datos.visita1Fecha || fechaVisita,
      visita1Hora: datos.visita1Hora || horaComun,
      visita2Fecha: null,
      visita2Hora: null,
      visita3Fecha: null,
      visita3Hora: null,
      nIntentos: 1,
    };
  }

  const numeroIntento = intentosPrev + 1;
  const fechaConfirmacion =
    formatFechaParaApi(datos.fechaConfirmacion) || fechaSistema();

  return {
    visita1Fecha: fechaConfirmacion,
    visita1Hora: horaComun,
    visita2Fecha: null,
    visita2Hora: null,
    visita3Fecha: null,
    visita3Hora: null,
    nIntentos: numeroIntento,
  };
}

/** @deprecated */
export const registrarSiguienteIntentoAlConfirmar = () => ({});
export const registrarSiguienteIntentoDesdeEntrega = registrarSiguienteIntentoAlConfirmar;

/** Borrador activo primero; si no, el último completado */
export function resolverRegistroParaVisitas(completado, borrador) {
  return borrador || completado || null;
}

export function mapVisitasDesdeRegistro(registro = {}) {
  if (!registro) {
    return VISITAS_COLUMNAS.map((v) => ({
      numero: v.numero,
      fecha: null,
      hora: null,
      registrada: false,
    }));
  }
  const horaComun = horaEntregaDelRegistro(registro);
  return VISITAS_COLUMNAS.map((v) => {
    const horaCol = registro[v.colHora] ?? registro[v.horaKey] ?? null;
    const { fechaFmt, registrada } = resolverFechaHoraVisita(
      registro,
      v.colFecha,
      v.colHora,
      v.fechaKey,
      v.horaKey
    );
    return {
      numero: v.numero,
      fecha: fechaFmt,
      hora: formatHoraParaApi(horaCol) || null,
      registrada: registrada || Boolean(fechaFmt && horaComun),
    };
  });
}

export function contarVisitasDesdePayload(datos = {}, horaEntregaFallback = null) {
  const horaComun = formatHoraParaApi(datos.horaEntrega) || formatHoraParaApi(horaEntregaFallback);
  let n = 0;
  for (const v of VISITAS_COLUMNAS) {
    if (visitaTieneDatos(datos[v.fechaKey], datos[v.horaKey], horaComun)) n += 1;
  }
  return n;
}

/** @deprecated Use prepararVisitasParaGuardar */
export function aplicarVisitaEntregaExitosa(datos = {}) {
  return prepararVisitasParaGuardar(datos);
}

export function bindVisitasSqlParams(datos = {}) {
  const out = {};
  for (const v of VISITAS_COLUMNAS) {
    out[v.fechaKey] = formatFechaParaApi(datos[v.fechaKey]) || null;
    out[v.horaKey] = formatHoraParaApi(datos[v.horaKey]) || null;
  }
  out.nIntentos = Math.min(
    MAX_VISITAS_NO_CONTESTO,
    Number(datos.nIntentos ?? datos.n_intentos ?? 1)
  );
  return out;
}

export function visitasSqlSetClause() {
  const partes = [];
  for (const v of VISITAS_COLUMNAS) {
    partes.push(`${v.colFecha} = :${v.fechaKey}`, `${v.colHora} = :${v.horaKey}`);
  }
  partes.push('n_intentos = :nIntentos');
  return partes.join(',\n      ');
}

/** Validación al cerrar novedad (paso 3) — un intento por confirmación */
export function validarVisitasParaCierre(datos = {}, opts = {}) {
  const errores = [];
  const intentosPrev = Number(opts.intentosNovPrevios ?? datos.intentosNovPrevios ?? 0);
  if (datos.modo === 'nov' && intentosPrev >= MAX_VISITAS_NO_CONTESTO) {
    errores.push('ya se registraron los 3 intentos de no contestó');
    return errores;
  }
  if (!formatHoraParaApi(datos.horaEntrega)) {
    errores.push('hora en datos de entrega (paso 1)');
  }
  return errores;
}

export function validarNuevaVisita(registro, numeroVisita, fecha, hora, opts = {}) {
  const n = Number(numeroVisita);
  if (!Number.isFinite(n) || n < 1 || n > MAX_VISITAS_NO_CONTESTO) {
    return 'Número de visita inválido (1 a 3)';
  }
  const intentosPrev = Number(opts.intentosNovPrevios ?? 0);
  const esperada = intentosPrev + 1;
  if (n !== esperada) {
    return `El siguiente intento es el ${esperada}`;
  }
  const horaComun = horaEntregaDelRegistro(registro);
  const f = formatFechaParaApi(fecha);
  const h = formatHoraParaApi(hora) || horaComun;
  if (!visitaTieneDatos(f, h, horaComun)) {
    return 'No se pudo registrar la fecha y hora de la visita';
  }
  const enBorrador = mapVisitasDesdeRegistro(registro).filter((v) => v.registrada);
  if (enBorrador.some((v) => v.numero === n)) {
    return `La visita ${n} ya fue registrada en este borrador`;
  }
  return null;
}

export function labelsVisitasParaSap(registro = {}) {
  const visitas = mapVisitasDesdeRegistro(registro).filter((v) => v.registrada);
  return visitas.map((v) => `Visita ${v.numero}: ${v.fecha} ${v.hora}`);
}

export function buildGestionVisitasResponse(registro = null, opts = {}) {
  const visitas = opts.visitas ?? mapVisitasDesdeRegistro(registro);
  const visitasRegistradas =
    opts.visitasRegistradas ?? (registro ? contarVisitasEnRegistro(registro) : 0);
  const maxVisitas = MAX_VISITAS_NO_CONTESTO;
  const puedeRegistrarModoNov =
    opts.puedeRegistrarModoNov !== undefined
      ? Boolean(opts.puedeRegistrarModoNov)
      : visitasRegistradas < maxVisitas && !opts.entregaExitosaCompletada;

  return {
    maxVisitas,
    visitasRegistradas,
    visitas,
    fechaEntrega: formatFechaParaApi(registro?.fecha_entrega ?? registro?.fechaEntrega),
    horaEntrega: horaEntregaDelRegistro(registro),
    registroId: registro?.id || null,
    cumplidoId: registro?.id || null,
    siguienteVisita: visitasRegistradas < maxVisitas ? visitasRegistradas + 1 : null,
    puedeRegistrarVisita: Boolean(opts.puedeRegistrarVisita),
    puedeRegistrarModoNov,
    entregaFallidaCompletada: Boolean(opts.entregaFallidaCompletada),
    entregaExitosaCompletada: Boolean(opts.entregaExitosaCompletada),
    bloqueadoNuevoRegistro: Boolean(opts.bloqueadoNuevoRegistro),
    motivoBloqueo: opts.motivoBloqueo || null,
    cumplidoEnBorrador: Boolean(opts.cumplidoEnBorrador),
    modoBorrador: opts.modoBorrador || registro?.modo || null,
    historialIntentos: opts.historialIntentos || null,
  };
}
