import * as cumplidosService from '../services/cumplidos.service.js';

export async function seleccionarEntrega(req, res, next) {
  try {
    const { tknum, vbeln } = req.params;
    const resultado = await cumplidosService.seleccionarEntregaCompleta(tknum, vbeln);

    if (!resultado.encontrado) {
      return res.status(404).json({
        ok: false,
        error: `No se encontró la entrega ${vbeln} en el transporte ${tknum}`,
      });
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
