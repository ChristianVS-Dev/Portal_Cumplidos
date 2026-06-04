import { fechaParaInput, horaParaInput } from '../utils/fechaHoraEntrega.js';

export const MAX_VISITAS = 3;

export const AVISO_REGISTRO_PORTAL = 'Esta entrega ya tiene un registro en el portal';

export const VISITAS_SLOTS = [
  { numero: 1, label: 'Visita 1 (primer intento)' },
  { numero: 2, label: 'Visita 2 (segundo intento)' },
  { numero: 3, label: 'Visita 3 (tercer intento)' },
];

export function visitasFormVacios() {
  return {
    1: { fecha: '', hora: '' },
    2: { fecha: '', hora: '' },
    3: { fecha: '', hora: '' },
  };
}

/** Solo hora del paso 1 en pantalla (no usar gestion.horaEntrega de BD) */
export function visitasFormDesdeGestion(gestion, horaPaso1 = '') {
  const base = visitasFormVacios();
  if (!gestion?.visitas?.length) return base;
  const horaUi = horaParaInput(horaPaso1);
  for (const v of gestion.visitas) {
    const f = fechaParaInput(v.fecha);
    if (!f) continue;
    base[v.numero] = {
      fecha: f,
      hora: horaUi,
    };
  }
  return base;
}

export function fechaVisitaDesdeGestion(gestion, numero) {
  const v = gestion?.visitas?.find((x) => x.numero === numero);
  return fechaParaInput(v?.fecha) || '';
}

/**
 * Fechas de visita las asigna el servidor al confirmar (día de confirmación).
 * Solo se envía horaEntrega en el payload principal del cumplido.
 */
export function payloadVisitasDesdeForm() {
  return {
    visita1Fecha: null,
    visita1Hora: null,
    visita2Fecha: null,
    visita2Hora: null,
    visita3Fecha: null,
    visita3Hora: null,
  };
}

export function cuentaVisitasEnForm(visitasForm = {}, horaEntregaPaso1 = '') {
  const horaComun = horaParaInput(horaEntregaPaso1);
  let n = 0;
  for (let i = 1; i <= MAX_VISITAS; i += 1) {
    const f = fechaParaInput(visitasForm[i]?.fecha);
    const h = horaParaInput(visitasForm[i]?.hora) || horaComun;
    if (f && h) n += 1;
  }
  return n;
}

export function cuentaVisitasGestion(gestion) {
  return gestion?.visitasRegistradas ?? 0;
}

export function formatearFechaHoraVisita(fecha, hora) {
  const f = fechaParaInput(fecha);
  if (!f) return '—';
  const h = horaParaInput(hora);
  return h ? `${f} ${h}` : f;
}

/** Texto de intento ya guardado en BD (solo datos de gestionVisitas, no el formulario en vivo) */
export function formatearIntentoGuardado(visita) {
  if (!visita?.fecha) return null;
  return formatearFechaHoraVisita(visita.fecha, visita.hora);
}

export function aplicarVisitasFormDesdeConsulta(gestion, { soloBorrador = true } = {}) {
  if (soloBorrador && !gestion?.cumplidoEnBorrador) {
    return visitasFormVacios();
  }
  return visitasFormDesdeGestion(gestion, '');
}

export function textoEtiquetaVisitas(gestion) {
  if (!gestion) return null;
  const { visitasRegistradas = 0, maxVisitas = MAX_VISITAS } = gestion;
  if (
    gestion.bloqueadoNuevoRegistro ||
    (gestion.entregaFallidaCompletada && gestion.puedeRegistrarModoNov === false)
  ) {
    return `Intentos: ${visitasRegistradas}/${maxVisitas} (máximo alcanzado)`;
  }
  if (gestion.entregaFallidaCompletada) {
    return `Intentos: ${visitasRegistradas}/${maxVisitas}`;
  }
  if (visitasRegistradas > 0) {
    return `Visitas: ${visitasRegistradas}/${maxVisitas}`;
  }
  return `Visitas: 0/${maxVisitas}`;
}
