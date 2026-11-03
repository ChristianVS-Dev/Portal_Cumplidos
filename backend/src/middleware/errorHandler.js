export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const interno = status >= 500;
  if (interno) console.error('[API Error]', err.status || status, err.code || '', err.message);
  const message = interno
    ? 'No se pudo completar la operación'
    : err.message || 'No se pudo completar la operación';

  res.status(status).json({
    ok: false,
    error: message,
    ...(err.code && !interno && { code: err.code }),
  });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
}
