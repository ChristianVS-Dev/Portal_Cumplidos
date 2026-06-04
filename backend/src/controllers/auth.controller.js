import * as authService from '../services/auth.service.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json({ ok: false, error: 'Correo y contraseña son obligatorios' });
    }
    const data = await authService.login(email, password);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const perfil = await authService.obtenerPerfil(req.user.id);
    if (!perfil) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    res.json({ ok: true, data: perfil });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email?.trim()) {
      return res.status(400).json({ ok: false, error: 'Ingrese su correo electrónico' });
    }
    const data = await authService.solicitarRecuperacion(email);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token de recuperación requerido' });
    }
    const data = await authService.restablecerContrasena(token, password);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

export async function reportarConexion(req, res, next) {
  try {
    const { mensaje, tipo, email, nombre, userAgent, paginaUrl } = req.body;
    if (!mensaje?.trim()) {
      return res.status(400).json({ ok: false, error: 'Describa el problema de conexión' });
    }
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const data = await authService.reportarProblemaConexion(
      { mensaje, tipo, email, nombre, userAgent, paginaUrl },
      req.user,
      ip
    );
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}
