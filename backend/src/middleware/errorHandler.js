export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  if (process.env.NODE_ENV !== 'production') {
    console.error('[API Error]', err);
  }

  res.status(status).json({
    ok: false,
    error: message,
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV !== 'production' && err.cause && { detail: String(err.cause) }),
  });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
}
