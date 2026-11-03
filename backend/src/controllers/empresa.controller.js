import { consultarEntregaEmpresa, listarEntregasEmpresa } from '../services/empresa-entregas.service.js';

function soloEmpresa(req, res) {
  if (req.acceso?.tipo === 'empresa' && req.acceso.transportistaCodigo) return true;
  res.status(403).json({ ok: false, error: 'Esta consulta es solo para una cuenta de empresa' });
  return false;
}

function responderError(res, next, err) {
  if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
  return next(err);
}

export async function listar(req, res, next) {
  try {
    if (!soloEmpresa(req, res)) return;
    const data = await listarEntregasEmpresa(req.acceso.transportistaCodigo, req.query || {});
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, data });
  } catch (err) {
    responderError(res, next, err);
  }
}

export async function detalle(req, res, next) {
  try {
    if (!soloEmpresa(req, res)) return;
    const data = await consultarEntregaEmpresa(req.acceso.transportistaCodigo, req.params.numero);
    if (!data.existe) {
      return res.status(404).json({ ok: false, error: 'No encontramos esa entrega' });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, data });
  } catch (err) {
    responderError(res, next, err);
  }
}
