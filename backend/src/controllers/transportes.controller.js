import { transporteDelConductor } from '../domain/conductor-acceso.js';
import * as cumplidosService from '../services/cumplidos.service.js';

export async function seleccionarEntrega(req, res, next) {
  try {
    const { tknum, vbeln } = req.params;
    const resultado = await cumplidosService.seleccionarEntregaCompleta(tknum, vbeln);

    const propia = transporteDelConductor(req.acceso, {
      placa: resultado.transporte?.placa || resultado.sap?.placaAsignada || resultado.sap?.placaSap,
      conductor: resultado.transporte?.conductor,
      documentoConductor: resultado.sap?.documentoConductor,
    });
    if (!resultado.encontrado || !propia) {
      return res.status(404).json({ ok: false, error: 'Entrega no disponible para esta cuenta' });
    }

    res.json({
      ok: true,
      data: resultado,
      mensaje: 'Entrega guardada en MySQL · borrador listo',
    });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    next(err);
  }
}
