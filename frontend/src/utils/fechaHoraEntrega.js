/** Valor válido para input type=date (yyyy-MM-dd) y type=time (HH:MM) */

export function fechaParaInput(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dm = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  return '';
}

export function horaParaInput(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const hh = String(value.getUTCHours()).padStart(2, '0');
    const mm = String(value.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

/** @deprecated Use horaParaInput */
export function normalizarHora(hora) {
  return horaParaInput(hora);
}

export function fechaEntregaAutomatica() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function horaEntregaDesdeTransporte(transporte) {
  if (!transporte) return '';
  return horaParaInput(transporte.horaInicioRuta) || horaParaInput(transporte.horaCreacion) || '';
}

export function etiquetaFechaHoraEntrega(fecha, hora) {
  const f = fechaParaInput(fecha) || fechaEntregaAutomatica();
  const h = horaParaInput(hora);
  return h ? `${f} · ${h}` : f;
}
