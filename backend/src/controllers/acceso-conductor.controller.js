import crypto from 'crypto';
import { config } from '../config/index.js';
import {
  establecerCookieSesion,
  leerCookieSesion,
  limpiarCookieSesion,
} from '../domain/sesion-cookie.js';
import * as acceso from '../services/acceso-conductor.service.js';

function responder(res, status, body) {
  res.set('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export async function crearConductor(req, res, next) {
  try {
    const esperado = config.admin.apiKey;
    const recibido = req.headers['x-admin-key'];
    const claveA = Buffer.from(String(esperado || ''));
    const claveB = Buffer.from(String(recibido || ''));
    const coincide =
      claveA.length > 0 && claveA.length === claveB.length && crypto.timingSafeEqual(claveA, claveB);
    if (!coincide) {
      return responder(res, 401, { ok: false, error: 'No autorizado para crear conductores' });
    }
    const data = await acceso.crearConductor(req.body || {});
    responder(res, 201, { ok: true, data, mensaje: 'Conductor registrado' });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}

export async function registrar(req, res, next) {
  try {
    const resultado = await acceso.registrarSolicitud(req.body || {}, req);
    const empresa = req.body?.tipo === 'empresa';
    const mensaje = resultado?.requiereConfirmacion
      ? resultado.correoEnviado
        ? 'Cuenta creada. Revise su correo y confirme la dirección antes de iniciar sesión.'
        : 'Cuenta creada, pero no se pudo enviar el correo de confirmación. En el ingreso puede reenviarlo.'
      : empresa
        ? 'Cuenta creada. Ya puede iniciar sesión con su código de transportista y contraseña.'
        : 'Cuenta creada. Ya puede iniciar sesión con su documento, placa y contraseña.';
    responder(res, 200, { ok: true, mensaje });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}

export async function ingresar(req, res, next) {
  try {
    const data = await acceso.ingresar(req.body || {});
    establecerCookieSesion(res, req, data.token);
    delete data.token;
    responder(res, 200, { ok: true, data, mensaje: 'Ingreso correcto' });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message, code: err.code });
    next(err);
  }
}

export async function confirmar(req, res, next) {
  try {
    await acceso.confirmarCorreo(req.body || {});
    responder(res, 200, {
      ok: true,
      mensaje: 'Correo confirmado. Ya puede iniciar sesión con su documento, placa y contraseña.',
    });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}

export async function reenviarConfirmacion(req, res, next) {
  try {
    await acceso.reenviarConfirmacion(req.body || {}, req);
    responder(res, 200, {
      ok: true,
      mensaje: req.body?.tipo === 'empresa'
        ? 'Si la cuenta de empresa está pendiente de confirmación, enviamos otro enlace al correo registrado.'
        : 'Si la cuenta está pendiente de confirmación, enviamos otro enlace al correo registrado.',
    });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}

export async function recuperar(req, res, next) {
  try {
    await acceso.solicitarRestablecimiento(req.body || {}, req);
    const empresa = req.body?.tipo === 'empresa';
    responder(res, 200, {
      ok: true,
      mensaje: empresa
        ? `Si el código corresponde a una cuenta de empresa con correo, enviamos un enlace para elegir una nueva contraseña. Revise la bandeja y el correo no deseado. El enlace vence en ${config.auth.resetExpiresMin} minutos y solo puede usarse una vez.`
        : `Si el documento y la placa corresponden a una cuenta con correo, enviamos un enlace para elegir una nueva contraseña. Revise la bandeja y el correo no deseado. El enlace vence en ${config.auth.resetExpiresMin} minutos y solo puede usarse una vez.`,
    });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}

export async function restablecer(req, res, next) {
  try {
    await acceso.restablecerContrasena(req.body || {});
    limpiarCookieSesion(res, req);
    responder(res, 200, {
      ok: true,
      mensaje: 'Contraseña actualizada. Cerramos las sesiones abiertas. Inicie sesión con la nueva contraseña.',
    });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}

export async function sesion(req, res, next) {
  try {
    const data = await acceso.obtenerSesionActiva(leerCookieSesion(req), {
      depurar: req.query.sincronizar === '1',
    });
    if (!data) {
      return responder(res, 401, { ok: false, error: 'Sesión vencida o inexistente' });
    }
    responder(res, 200, { ok: true, data });
  } catch (err) {
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}

export async function salir(req, res, next) {
  try {
    await acceso.cerrarSesion(leerCookieSesion(req));
    limpiarCookieSesion(res, req);
    responder(res, 200, { ok: true, mensaje: 'Sesión cerrada' });
  } catch (err) {
    limpiarCookieSesion(res, req);
    if (err.status) return responder(res, err.status, { ok: false, error: err.message });
    next(err);
  }
}
