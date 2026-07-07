import { MOTIVOS_NO_CONTESTO } from './motivosNoContesto.js';

/** SAP: campo observacion en POST .../intento — menos de 120 caracteres */
export const OBSERVACION_SAP_MAX = 119;

const SEP_NOV = ' — ';

export function labelsMotivosActivos(motivosNov = {}) {
  return MOTIVOS_NO_CONTESTO.filter((m) => Boolean(motivosNov[m.key])).map((m) => m.label);
}

export function buildObservacionNovPreview(motivosNov = {}, descripcion = '') {
  const motivosTxt = labelsMotivosActivos(motivosNov).join(', ');
  const desc = String(descripcion || '').trim();

  if (!motivosTxt && !desc) return 'Novedad en entrega';
  if (!desc) return motivosTxt;
  if (!motivosTxt) return desc.slice(0, OBSERVACION_SAP_MAX);
  if (motivosTxt.length + SEP_NOV.length + desc.length <= OBSERVACION_SAP_MAX) {
    return `${motivosTxt}${SEP_NOV}${desc}`;
  }
  const roomForDesc = OBSERVACION_SAP_MAX - motivosTxt.length - SEP_NOV.length;
  if (roomForDesc > 0) {
    return `${motivosTxt}${SEP_NOV}${desc.slice(0, roomForDesc)}`;
  }
  return motivosTxt.slice(0, OBSERVACION_SAP_MAX);
}

export function maxDescripcionNovCaracteres(motivosNov = {}) {
  const motivosTxt = labelsMotivosActivos(motivosNov).join(', ');
  if (motivosTxt.length >= OBSERVACION_SAP_MAX) return 0;
  if (!motivosTxt) return OBSERVACION_SAP_MAX;
  return OBSERVACION_SAP_MAX - motivosTxt.length - SEP_NOV.length;
}

export function validarObservacionNov(motivosNov = {}, descripcion = '') {
  const motivosTxt = labelsMotivosActivos(motivosNov).join(', ');
  if (motivosTxt.length > OBSERVACION_SAP_MAX) {
    return `Los motivos seleccionados superan ${OBSERVACION_SAP_MAX} caracteres (límite SAP). Desmarque alguno.`;
  }
  const desc = String(descripcion || '').trim();
  const total =
    motivosTxt.length + (motivosTxt && desc ? SEP_NOV.length : 0) + desc.length;
  if (total > OBSERVACION_SAP_MAX) {
    const maxDesc = maxDescripcionNovCaracteres(motivosNov);
    return `Motivos y descripción superan ${OBSERVACION_SAP_MAX} caracteres (SAP). Máximo ${maxDesc} en la descripción.`;
  }
  return null;
}
