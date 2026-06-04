import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import * as emailService from './email.service.js';

const DEV_USER = {
  id: 'dev-00000000-0000-0000-0000-000000000001',
  email: 'demo@grupodecor.com',
  nombre: 'Transportista Demo',
  rol: 'transportista',
  password: 'Decor2025!',
};

let devPasswordHash = null;
const devResetTokens = new Map();
let mysqlDisponible = null;

async function getDevUserRecord() {
  if (!devPasswordHash) {
    devPasswordHash = await bcrypt.hash(DEV_USER.password, 10);
  }
  return {
    id: DEV_USER.id,
    email: DEV_USER.email,
    nombre: DEV_USER.nombre,
    rol: DEV_USER.rol,
    password_hash: devPasswordHash,
    activo: 1,
  };
}

async function checkMysql() {
  if (mysqlDisponible !== null) return mysqlDisponible;
  try {
    await query('SELECT 1');
    mysqlDisponible = true;
  } catch {
    mysqlDisponible = false;
  }
  return mysqlDisponible;
}

function useDevAuth() {
  return config.auth.devMode || config.nodeEnv === 'development';
}

async function findByEmail(email) {
  const normalized = email.trim().toLowerCase();
  if (!(await checkMysql())) {
    if (useDevAuth() && normalized === DEV_USER.email) {
      return getDevUserRecord();
    }
    return null;
  }
  const rows = await query(
    `SELECT id, email, password_hash, nombre, rol, activo, reset_token, reset_expires
     FROM usuarios WHERE email = :email LIMIT 1`,
    { email: normalized }
  );
  return rows[0] || null;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpires }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.auth.jwtSecret);
}

export async function login(email, password) {
  const user = await findByEmail(email);
  if (!user || !user.activo) {
    throw Object.assign(new Error('Correo o contraseña incorrectos'), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Correo o contraseña incorrectos'), { status: 401 });
  }

  if (await checkMysql()) {
    await query(`UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = :id`, { id: user.id });
  }

  const token = signToken(user);
  return {
    token,
    user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
  };
}

export async function solicitarRecuperacion(email) {
  const user = await findByEmail(email);
  const mensajeGenerico =
    'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.';

  if (!user) {
    return { mensaje: mensajeGenerico, enviado: false };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.auth.resetExpiresMin * 60 * 1000);

  if (await checkMysql()) {
    await query(
      `UPDATE usuarios SET reset_token = :token, reset_expires = :expires WHERE id = :id`,
      { id: user.id, token, expires }
    );
  } else if (useDevAuth()) {
    devResetTokens.set(token, { expires: expires.getTime(), userId: user.id });
  }

  const resetUrl = `${config.auth.frontendUrl}/restablecer-contrasena?token=${token}`;
  await emailService.enviarRecuperacionContrasena(user.email, user.nombre, resetUrl);

  return { mensaje: mensajeGenerico, enviado: true, devResetUrl: config.nodeEnv === 'development' ? resetUrl : undefined };
}

export async function restablecerContrasena(token, nuevaPassword) {
  if (!nuevaPassword || nuevaPassword.length < 6) {
    throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres'), { status: 400 });
  }

  if (!(await checkMysql())) {
    if (useDevAuth()) {
      const entry = devResetTokens.get(token);
      if (!entry || entry.expires < Date.now()) {
        throw Object.assign(new Error('Enlace inválido o expirado'), { status: 400 });
      }
      devPasswordHash = await bcrypt.hash(nuevaPassword, 12);
      devResetTokens.delete(token);
      return { mensaje: 'Contraseña actualizada (modo desarrollo). Ya puedes iniciar sesión.' };
    }
    throw Object.assign(new Error('Base de datos no disponible'), { status: 503 });
  }

  const rows = await query(
    `SELECT id FROM usuarios
     WHERE reset_token = :token AND reset_expires > NOW() LIMIT 1`,
    { token }
  );
  if (!rows.length) {
    throw Object.assign(new Error('Enlace inválido o expirado'), { status: 400 });
  }

  const hash = await bcrypt.hash(nuevaPassword, 12);
  await query(
    `UPDATE usuarios SET password_hash = :hash, reset_token = NULL, reset_expires = NULL WHERE id = :id`,
    { id: rows[0].id, hash }
  );

  return { mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
}

export async function obtenerPerfil(userId) {
  if (!(await checkMysql())) {
    if (userId === DEV_USER.id) {
      return { id: DEV_USER.id, email: DEV_USER.email, nombre: DEV_USER.nombre, rol: DEV_USER.rol };
    }
    return null;
  }
  const rows = await query(
    `SELECT id, email, nombre, rol FROM usuarios WHERE id = :id AND activo = 1`,
    { id: userId }
  );
  return rows[0] || null;
}

export async function reportarProblemaConexion(payload, reqUser, ip) {
  const id = uuidv4();
  const registro = {
    usuario_email: payload.email || reqUser?.email || null,
    usuario_nombre: payload.nombre || reqUser?.nombre || null,
    mensaje: payload.mensaje?.trim() || 'Sin detalle adicional',
    tipo: payload.tipo || 'general',
    user_agent: payload.userAgent?.slice(0, 500) || null,
    pagina_url: payload.paginaUrl?.slice(0, 500) || null,
    ip_origen: ip || null,
  };

  if (await checkMysql()) {
    await query(
      `INSERT INTO reportes_conexion (usuario_email, usuario_nombre, mensaje, tipo, user_agent, pagina_url, ip_origen)
       VALUES (:usuario_email, :usuario_nombre, :mensaje, :tipo, :user_agent, :pagina_url, :ip_origen)`,
      registro
    );
    await query(
      `INSERT INTO pc_auditoria (entidad, entidad_id, accion, detalle)
       VALUES ('reporte_conexion', :id, 'CREAR', :detalle)`,
      { id, detalle: JSON.stringify(registro) }
    );
  } else {
    console.log('\n⚠️ [REPORTE CONEXIÓN - sin MySQL]', JSON.stringify(registro, null, 2));
  }

  await emailService.enviarReporteConexionSoporte({
    reporte: registro,
    usuario: reqUser || { email: registro.usuario_email, nombre: registro.usuario_nombre },
  });

  return {
    mensaje: 'Reporte enviado. El equipo de soporte fue notificado.',
    id,
  };
}
