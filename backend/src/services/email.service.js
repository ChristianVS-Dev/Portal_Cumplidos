import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export async function enviarCorreo({ to, subject, html, text }) {
  const transport = getTransporter();
  if (!transport) {
    console.log('\n📧 [EMAIL SIMULADO - sin SMTP]');
    console.log(`   Para: ${to}`);
    console.log(`   Asunto: ${subject}`);
    console.log(`   ${text || html}\n`);
    return { simulado: true };
  }
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });
  return { simulado: false };
}

export async function enviarRecuperacionContrasena(email, nombre, resetUrl) {
  return enviarCorreo({
    to: email,
    subject: 'Recuperar contraseña · Portal Cumplidos',
    html: `
      <div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#263238;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
          <strong>Grupo Decor</strong><br><span style="font-size:12px;color:#90a4ae;">Portal de Cumplidos</span>
        </div>
        <div style="border:1px solid #e8ecef;padding:24px;border-radius:0 0 12px 12px;">
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Recibimos una solicitud para restablecer tu contraseña. El enlace expira en ${config.auth.resetExpiresMin} minutos.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="background:#455a64;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Restablecer contraseña</a>
          </p>
          <p style="font-size:12px;color:#90a4ae;">Si no solicitaste este cambio, ignora este correo.</p>
        </div>
      </div>`,
    text: `Hola ${nombre}, restablece tu contraseña en: ${resetUrl}`,
  });
}

export async function enviarReporteConexionSoporte({ reporte, usuario }) {
  const to = config.auth.soporteEmail;
  return enviarCorreo({
    to,
    subject: `[Portal Cumplidos] Reporte sin conexión · ${reporte.tipo}`,
    html: `
      <div style="font-family:Poppins,sans-serif;padding:16px;">
        <h3 style="color:#263238;">Reporte de conexión</h3>
        <p><strong>Usuario:</strong> ${usuario?.nombre || 'Anónimo'} (${usuario?.email || reporte.usuario_email || 'N/A'})</p>
        <p><strong>Tipo:</strong> ${reporte.tipo}</p>
        <p><strong>Mensaje:</strong> ${reporte.mensaje}</p>
        <p><strong>URL:</strong> ${reporte.pagina_url || '—'}</p>
        <p><strong>Agente:</strong> ${reporte.user_agent || '—'}</p>
        <p style="font-size:11px;color:#90a4ae;">${new Date().toISOString()}</p>
      </div>`,
    text: `Reporte: ${reporte.mensaje} - ${usuario?.email}`,
  });
}
