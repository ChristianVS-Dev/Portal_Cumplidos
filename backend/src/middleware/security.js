import { config } from '../config/index.js';
import { leerCookieSesion } from '../domain/sesion-cookie.js';
import { validarSesion } from '../services/acceso-conductor.service.js';

const buckets = new Map();

function clientIp(req) {
  const cadena = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean);
  if (cadena.length) return cadena[cadena.length - 1];
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function rutaLimitada(req) {
  const path = (req.originalUrl || req.path || '').split('?')[0];
  return path.replace(/\/\d{4,}/g, '/:n').replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id');
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

export function createRateLimiter({ windowMs = 60_000, max = 120, clave } = {}) {
  return (req, res, next) => {
    const extra = typeof clave === 'function' ? clave(req) : '';
    if (extra === false) return next();
    const key = `${extra || clientIp(req)}:${req.method}:${rutaLimitada(req)}`;
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

export const rateLimitIngreso = createRateLimiter({
  windowMs: 60_000,
  max: 8,
});

export const rateLimitRegistro = createRateLimiter({
  windowMs: 60_000,
  max: 5,
});

export const rateLimitRecuperar = createRateLimiter({
  windowMs: 60_000,
  max: 5,
});

/** La misma cédula no puede insistir desde muchas direcciones. */
export const rateLimitCuenta = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  clave: (req) => {
    const cedula = String(req.body?.cedula || '').replace(/\D/g, '');
    return cedula.length >= 5 ? `cedula:${cedula}` : false;
  },
});

export async function requireSesion(req, res, next) {
  try {
    const acceso = await validarSesion(leerCookieSesion(req));
    if (!acceso) {
      return res.status(401).json({ ok: false, error: 'Sesión vencida o inexistente' });
    }
    req.acceso = acceso;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** El navegador envía Origin. Solo el portal y la APK pueden usar la cookie. */
export function origenPermitido(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const crudo = req.headers.origin;
  if (!crudo) return next();
  let origen;
  try {
    origen = new URL(crudo);
  } catch {
    return res.status(403).json({ ok: false, error: 'Solicitud rechazada' });
  }
  const host = (
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  )
    .toString()
    .split(',')[0]
    .trim();
  if (origen.host === host || config.corsOrigins.includes(origen.origin)) return next();
  if (config.nodeEnv !== 'production' && (origen.hostname === 'localhost' || origen.hostname === '127.0.0.1')) {
    return next();
  }
  return res.status(403).json({ ok: false, error: 'Solicitud rechazada' });
}
