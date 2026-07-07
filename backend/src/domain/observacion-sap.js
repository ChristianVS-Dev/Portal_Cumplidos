import { labelsMotivosActivos } from './motivos-no-contesto.js';

/** SAP: campo observacion en POST .../intento — menos de 120 caracteres */
export const OBSERVACION_SAP_MAX = 119;

const SEP_NOV = ' — ';

/**
 * Motivos de novedad + descripción (texto enviado a SAP en cada intento nov).
 */
export function buildObservacionNovSap(datos = {}) {
  const motivosTxt = labelsMotivosActivos(datos).join(', ');
  const desc = String(datos.descripcionNovedad || '').trim();

  if (!motivosTxt && !desc) return 'Novedad en entrega';
  if (!desc) return motivosTxt;
  if (!motivosTxt) return desc.slice(0, OBSERVACION_SAP_MAX);

  const total = motivosTxt.length + SEP_NOV.length + desc.length;
  if (total <= OBSERVACION_SAP_MAX) {
    return `${motivosTxt}${SEP_NOV}${desc}`;
  }

  const roomForDesc = OBSERVACION_SAP_MAX - motivosTxt.length - SEP_NOV.length;
  if (roomForDesc > 0) {
    return `${motivosTxt}${SEP_NOV}${desc.slice(0, roomForDesc)}`;
  }

  return motivosTxt.slice(0, OBSERVACION_SAP_MAX);
}

export function buildObservacionIntentoSap(modo, datos = {}) {
  if (modo === 'ok') {
    const obs = String(datos.observaciones || '').trim();
    return obs ? obs.slice(0, OBSERVACION_SAP_MAX) : null;
  }
  if (modo !== 'nov') return null;
  return buildObservacionNovSap(datos);
}

/** @returns {string|null} mensaje de error o null si válido */
export function validarObservacionNovSap(datos = {}) {
  const motivosTxt = labelsMotivosActivos(datos).join(', ');
  if (motivosTxt.length > OBSERVACION_SAP_MAX) {
    return `Los motivos seleccionados superan ${OBSERVACION_SAP_MAX} caracteres (límite SAP). Desmarque alguno.`;
  }

  const desc = String(datos.descripcionNovedad || '').trim();
  const total =
    motivosTxt.length +
    (motivosTxt && desc ? SEP_NOV.length : 0) +
    desc.length;

  if (total > OBSERVACION_SAP_MAX) {
    const maxDesc =
      OBSERVACION_SAP_MAX -
      motivosTxt.length -
      (motivosTxt ? SEP_NOV.length : 0);
    return `La descripción y los motivos juntos superan ${OBSERVACION_SAP_MAX} caracteres (SAP). Reduzca la descripción a ${Math.max(0, maxDesc)} caracteres o menos.`;
  }

  return null;
}
