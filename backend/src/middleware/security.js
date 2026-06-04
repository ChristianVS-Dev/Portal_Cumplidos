import { config } from '../config/index.js';

const buckets = new Map();

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Clave compartida del portal (no es login por usuario).
 * El front la envía en cabecera; el conductor no escribe nada.
 * Si PORTAL_API_KEY está vacío, se desactiva (solo desarrollo local).
 */
export function portalApiKey(req, res, next) {
  const expected = config.portal.apiKey;
  if (!expected) return next();

  const url = req.originalUrl || req.path || '';
  if (url.includes('/health')) {
    return next();
  }

  const provided = req.headers['x-portal-key'];
  if (provided && provided === expected) return next();

  return res.status(401).json({
    ok: false,
    error: 'Acceso no autorizado al portal',
    code: 'PORTAL_KEY_INVALID',
  });
}

export function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  return (req, res, next) => {
    const key = `${clientIp(req)}:${req.method}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      return res.status(429).json({
        ok: false,
        error: 'Demasiadas solicitudes. Espere un momento e intente de nuevo.',
        code: 'RATE_LIMIT',
      });
    }
    return next();
  };
}

export const rateLimitGeneral = createRateLimiter({
  windowMs: config.portal.rateLimitWindowMs,
  max: config.portal.rateLimitMax,
});

export const rateLimitBuscar = createRateLimiter({
  windowMs: config.portal.rateLimitWindowMs,
  max: config.portal.rateLimitBuscarMax,
});

export const rateLimitAdjuntos = createRateLimiter({
  windowMs: config.portal.rateLimitWindowMs,
  max: config.portal.rateLimitAdjuntosMax,
});
