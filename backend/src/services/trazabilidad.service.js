import { getSupabase } from '../db/supabase.js';

const ACCIONES = new Set([
  'sincronizar',
  'ocultar_entrega',
  'restaurar_entrega',
  'seleccionar_entrega',
  'rechazar_entrega',
  'ver_detalle',
  'listar_adjuntos',
  'ver_adjunto',
  'descargar_adjunto',
  'eliminar_adjunto',
  'enviar_adjuntos',
  'reemplazar_adjuntos',
  'restaurar_entrega',
  'actualizar_entrega',
]);

function detalleSeguro(detalle) {
  if (!detalle || typeof detalle !== 'object') return {};
  const plano = {};
  for (const [clave, valor] of Object.entries(detalle)) {
    if (valor == null || ['string', 'number', 'boolean'].includes(typeof valor)) {
      plano[clave] = typeof valor === 'string' ? valor.slice(0, 300) : valor;
    }
  }
  return plano;
}

function filaEvento(evento) {
  if (!evento?.conductorId || !ACCIONES.has(evento.accion)) return null;
  const resultado = ['ok', 'rechazado', 'error'].includes(evento.resultado) ? evento.resultado : 'ok';
  return {
    conductor_id: evento.conductorId,
    sesion_id: evento.sesionId || null,
    sincronizacion_id: evento.sincronizacionId || null,
    accion: evento.accion,
    numero_entrega: evento.numeroEntrega ? String(evento.numeroEntrega).slice(0, 20) : null,
    doc_id: evento.docId ? String(evento.docId).slice(0, 64) : null,
    resultado,
    detalle: detalleSeguro(evento.detalle),
  };
}

/** Registra una acción del portal. Un fallo aquí no interrumpe la operación del conductor. */
export async function registrarEvento(evento) {
  const fila = filaEvento(evento);
  if (!fila) return;
  try {
    const sb = getSupabase();
    const { error } = await sb.from('pc_trazabilidad').insert(fila);
    if (error) console.error('[trazabilidad]', error.message);
  } catch (error) {
    console.error('[trazabilidad]', error.message || error);
  }
}

export async function registrarEventos(eventos) {
  const filas = (eventos || []).map(filaEvento).filter(Boolean);
  if (!filas.length) return;
  try {
    const sb = getSupabase();
    const { error } = await sb.from('pc_trazabilidad').insert(filas);
    if (error) console.error('[trazabilidad]', error.message);
  } catch (error) {
    console.error('[trazabilidad]', error.message || error);
  }
}

/** Abre el registro de una sincronización y devuelve su id. */
export async function abrirSincronizacion(datos) {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('pc_sincronizacion')
      .insert({
        conductor_id: datos.conductorId,
        placa: datos.placa,
        revisadas: datos.revisadas,
        propias: datos.propias,
        ocultadas: datos.ocultadas,
        mensaje: datos.mensaje ? String(datos.mensaje).slice(0, 500) : null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[trazabilidad] sincronizacion:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (error) {
    console.error('[trazabilidad] sincronizacion:', error.message || error);
    return null;
  }
}
