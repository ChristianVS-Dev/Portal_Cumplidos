import { guardarJsonDispositivo, leerJsonDispositivo } from '../lib/deviceStorage.js';

/** Si cambia el texto legal, suba la versión para volver a pedir aceptación. */
export const TERMINOS_VERSION = 1;

const STORAGE_KEY = 'portal_cumplidos.terminos';

export const TERMINOS_TITULO = 'Términos y condiciones del Portal de Cumplidos';

export const TERMINOS_PARRAFOS = [
  'El Portal de Cumplidos es una herramienta de Grupo Decor para que el conductor registre el resultado de cada entrega (cumplido exitoso o novedad), con evidencias fotográficas o documentales.',
  'Al usar el portal usted confirma que los datos, fotos y documentos que envía corresponden a la entrega consultada y que son veraces. Esta información se almacena en los sistemas de Grupo Decor y se sincroniza con SAP para el seguimiento logístico.',
  'Los datos de empresa transportista, placa y conductor se toman del transporte asignado en SAP. Solo deben corregirse si el dato del sistema no coincide con el vehículo o la empresa reales de esa entrega.',
  'La aceptación de estos términos queda registrada en este dispositivo y aplica a los envíos posteriores desde el mismo equipo. No es necesario volver a aceptarlos en cada entrega, salvo que se actualice esta versión.',
];

export function leerAceptacionTerminos() {
  const data = leerJsonDispositivo(STORAGE_KEY, null);
  if (!data?.aceptado || data.version !== TERMINOS_VERSION) {
    return {
      aceptado: false,
      version: data?.version ?? null,
      aceptadoAt: data?.aceptadoAt ?? null,
    };
  }
  return {
    aceptado: true,
    version: data.version,
    aceptadoAt: data.aceptadoAt,
  };
}

export function guardarAceptacionTerminos() {
  const record = {
    aceptado: true,
    version: TERMINOS_VERSION,
    aceptadoAt: new Date().toISOString(),
  };
  guardarJsonDispositivo(STORAGE_KEY, record);
  return record;
}

export function formatearFechaTerminos(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
