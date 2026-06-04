/** Fecha (yyyy-MM-dd) y hora (HH:MM:SS) para columnas DATE/TIME de MySQL */

/** Convierte DATE de MySQL, ISO o DD.MM.YYYY a yyyy-MM-dd */
export function formatFechaParaApi(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dm = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  return null;
}

/** Convierte TIME de MySQL a HH:MM:SS (nunca interpretar hora como fecha) */
export function formatHoraParaApi(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const hh = String(val.getUTCHours()).padStart(2, '0');
    const mm = String(val.getUTCMinutes()).padStart(2, '0');
    const ss = String(val.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${String(m[1]).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
}

export function normalizarHora(hora) {
  return formatHoraParaApi(hora);
}

export function fechaSistema() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function horaDesdeTransporteRaw(raw) {
  if (!raw) return null;
  const h =
    raw.hora_inicio_ruta ??
    raw.horaInicioRuta ??
    raw.hora_creacion ??
    raw.horaCreacion ??
    null;
  return formatHoraParaApi(h);
}

export function horaEntregaDesdeEntregaLocal(entregaLocal) {
  if (!entregaLocal) return null;
  const tr = entregaLocal.transporteApi || entregaLocal.transporteRaw;
  return (
    formatHoraParaApi(tr ? horaDesdeTransporteRaw(tr) : null) ||
    formatHoraParaApi(entregaLocal.horaEntrega ?? entregaLocal.hora_entrega)
  );
}

export function fechaHoraVisitaDesdeRegistro(registro = {}, fallbackHora = null) {
  const fecha = fechaSistema();
  const hora =
    formatHoraParaApi(registro?.hora_entrega ?? registro?.horaEntrega) ||
    formatHoraParaApi(fallbackHora) ||
    formatHoraParaApi(new Date().toTimeString().slice(0, 8));
  return { fecha, hora };
}

export function resolverFechaHoraEntregaCumplido(registro = {}, entregaLocal = null, datosEntrada = {}) {
  const fechaEntrega = fechaSistema();
  const horaEntrega =
    formatHoraParaApi(registro?.hora_entrega ?? registro?.horaEntrega) ||
    horaEntregaDesdeEntregaLocal(entregaLocal) ||
    formatHoraParaApi(datosEntrada?.horaEntrega ?? datosEntrada?.hora_entrega) ||
    null;
  return { fechaEntrega, horaEntrega };
}
