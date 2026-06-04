import * as authService from '../services/auth.service.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Sesión no válida. Inicie sesión nuevamente.' });
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      nombre: payload.nombre,
      rol: payload.rol,
    };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Sesión expirada. Inicie sesión nuevamente.' });
  }
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = authService.verifyToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        nombre: payload.nombre,
        rol: payload.rol,
      };
    } catch {
      /* sin sesión */
    }
  }
  next();
}
