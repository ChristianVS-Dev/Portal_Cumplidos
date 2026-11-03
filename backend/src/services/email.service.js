import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

const LOGO_CID = 'logo-grupo-decor';
const logoPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'logo-grupo.jpg');

let logoCache;
function leerLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = fs.readFileSync(logoPath);
  } catch {
    logoCache = null;
  }
  return logoCache;
}

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      requireTLS: config.smtp.requireTls,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function enviarCorreo({ to, cc, subject, html, text }) {
  const transport = getTransporter();
  const copia = String(cc || '').trim();
  const logo = leerLogo();
  const attachments = logo
    ? [{ filename: 'logo-grupo-decor.jpg', content: logo, cid: LOGO_CID, contentDisposition: 'inline' }]
    : undefined;
  if (!transport) {
    console.log('\n📧 [EMAIL SIMULADO - sin SMTP]');
    console.log(`   Para: ${to}`);
    console.log(`   Asunto: ${subject}`);
    console.log('   Cuerpo omitido para no registrar enlaces.\n');
    return { simulado: true };
  }
  await transport.sendMail({
    from: config.smtp.from,
    to,
    cc: copia || undefined,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
    attachments,
  });
  return { simulado: false };
}

function escaparHtml(valor) {
  return String(valor || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const FUENTE = 'Arial,Helvetica,sans-serif';

/** Misma presentación para confirmación, recuperación y avisos. */
export function plantillaCorreo({ preheader, titulo, saludo, parrafos = [], filas = [], boton, nota }) {
  const textoTitulo = escaparHtml(titulo);
  const vistaPrevia = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#eef1f4;">${escaparHtml(preheader)}${'&nbsp;&zwnj;'.repeat(24)}</div>`
    : '';
  const imagenLogo = leerLogo()
    ? `<img src="cid:${LOGO_CID}" width="64" height="64" alt="Grupo Decor" style="display:block;border:0;outline:none;text-decoration:none;width:64px;height:64px;border-radius:6px;">`
    : `<div style="width:64px;height:64px;background:#65686c;border-radius:6px;font-family:${FUENTE};font-size:13px;font-weight:700;color:#ffffff;text-align:center;line-height:64px;">GD</div>`;
  const marca = `<table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td width="64" style="width:64px;vertical-align:middle;">${imagenLogo}</td>
        <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="vertical-align:middle;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td width="2" height="38" bgcolor="#cfa583" style="width:2px;height:38px;background:#cfa583;font-size:0;line-height:38px;">&nbsp;</td>
          </tr></table>
        </td>
        <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="vertical-align:middle;font-family:${FUENTE};font-size:22px;line-height:1.15;font-weight:700;color:#ffffff;">Portal de <span style="color:#cfa583;">Cumplidos</span></td>
      </tr>
    </table>`;
  const bloques = parrafos
    .filter(Boolean)
    .map((parrafo) => `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:15px;line-height:1.55;color:#37474f;">${escaparHtml(parrafo)}</p>`)
    .join('');
  const datos = filas.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:#f4f7f8;border-radius:8px;">
        ${filas.map((fila, indice) => `<tr>
          <td style="padding:11px 14px;${indice < filas.length - 1 ? 'border-bottom:1px solid #e8ecef;' : ''}font-family:${FUENTE};">
            <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#78909c;">${escaparHtml(fila.etiqueta)}</div>
            <div style="margin-top:2px;font-size:15px;line-height:1.4;color:#263238;font-weight:600;">${escaparHtml(fila.valor)}</div>
          </td>
        </tr>`).join('')}
      </table>`
    : '';
  const accion = boton?.url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;">
        <tr>
          <td bgcolor="#455a64" style="background:#455a64;border-radius:8px;">
            <a href="${escaparHtml(boton.url)}" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${escaparHtml(boton.texto || 'Continuar')}</a>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0;font-family:${FUENTE};font-size:12px;line-height:1.5;color:#546e7a;">Si el botón no abre, copie este enlace en el navegador:<br>
        <a href="${escaparHtml(boton.url)}" style="color:#455a64;word-break:break-all;">${escaparHtml(boton.url)}</a>
      </p>`
    : '';
  const pie = nota
    ? `<p style="margin:18px 0 0;font-family:${FUENTE};font-size:13px;line-height:1.5;color:#546e7a;">${escaparHtml(nota)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${textoTitulo}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef1f4;">
    ${vistaPrevia}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" align="center"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e8ecef;border-radius:12px;">
            <tr>
              <td bgcolor="#10203f" style="background:#10203f;padding:22px 28px;border-radius:12px 12px 0 0;">
                ${marca}
              </td>
            </tr>
            <tr>
              <td bgcolor="#cfa583" style="background:#cfa583;height:3px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="margin:0 0 14px;font-family:${FUENTE};font-size:22px;line-height:1.25;font-weight:600;color:#263238;">${textoTitulo}</h1>
                ${saludo ? `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:15px;line-height:1.55;color:#37474f;">${saludo}</p>` : ''}
                ${bloques}
                ${datos}
                ${accion}
                ${pie}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-top:1px solid #eceff1;padding-top:14px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:#607d8b;">
                      Portal de Cumplidos · Grupo Decor<br>
                      Mensaje automático. No responda a este correo.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** No escribe el enlace en consola: el token no debe quedar en logs. */
export async function enviarEnlaceRestablecimiento({ to, nombre, resetUrl, minutos }) {
  const seguro = escaparHtml(nombre || 'conductor');
  const plazo = Number(minutos) || config.auth.resetExpiresMin || 60;
  const aviso = await enviarCorreo({
    to,
    subject: 'Restablecer contraseña · Portal de Cumplidos',
    html: plantillaCorreo({
      preheader: 'Use este enlace para elegir una nueva contraseña.',
      titulo: 'Restablecer contraseña',
      saludo: `Hola <strong>${seguro}</strong>,`,
      parrafos: [
        'Recibimos una solicitud para elegir una nueva contraseña.',
        `El enlace vence en ${plazo} minutos y solo puede usarse una vez.`,
      ],
      boton: { url: resetUrl, texto: 'Elegir nueva contraseña' },
      nota: 'Si no solicitó este cambio, ignore este correo. Su contraseña actual sigue vigente.',
    }),
    text: `Hola ${nombre || 'conductor'}. Hay una solicitud para restablecer la contraseña. El enlace vence en ${plazo} minutos y solo puede usarse una vez.\n\n${resetUrl}\n\nSi no solicitó este cambio, ignore este correo.`,
  });
  return { enviado: aviso.simulado !== true, simulado: Boolean(aviso.simulado) };
}

export async function enviarConfirmacionCuenta({ to, nombre, confirmUrl, minutos }) {
  const seguro = escaparHtml(nombre || 'conductor');
  const plazo = Number(minutos) || config.auth.confirmExpiresMin || 1440;
  const horas = Math.max(1, Math.round(plazo / 60));
  const aviso = await enviarCorreo({
    to,
    subject: 'Confirme su correo · Portal de Cumplidos',
    html: plantillaCorreo({
      preheader: 'Confirme su correo para ingresar al Portal de Cumplidos.',
      titulo: 'Confirme su correo',
      saludo: `Hola <strong>${seguro}</strong>,`,
      parrafos: [
        'Creamos su cuenta. Confirme que este correo es suyo para poder iniciar sesión.',
        `El enlace vence en ${horas} hora${horas === 1 ? '' : 's'} y solo puede usarse una vez.`,
      ],
      boton: { url: confirmUrl, texto: 'Confirmar correo' },
      nota: 'Si usted no creó esta cuenta, ignore este correo.',
    }),
    text: `Hola ${nombre || 'conductor'}. Confirme su correo para activar el ingreso al Portal de Cumplidos. El enlace vence en ${horas} horas y solo puede usarse una vez.\n\n${confirmUrl}\n\nSi usted no creó esta cuenta, ignore este correo.`,
  });
  return { enviado: aviso.simulado !== true, simulado: Boolean(aviso.simulado) };
}

export async function enviarRecuperacionContrasena(email, nombre, resetUrl) {
  return enviarEnlaceRestablecimiento({
    to: email,
    nombre,
    resetUrl,
    minutos: config.auth.resetExpiresMin,
  });
}

export async function enviarAvisoAdjuntoAdicional({ to, cc, entrega, observacion, conductor, archivos, segundo }) {
  const destinatarios = [...new Set((Array.isArray(to) ? to : [to]).map((correo) => String(correo || '').trim()).filter(Boolean))];
  if (!destinatarios.length) return { enviado: false };
  const nombre = conductor?.nombre || 'Conductor';
  const documento = conductor?.cedula || '—';
  const placa = conductor?.placa || '—';
  const numero = entrega;
  const nota = observacion;
  const lista = (archivos || []).join(', ') || '—';
  const titulo = segundo ? 'Se cargó un segundo cumplido' : 'Se cargó un cumplido adicional';
  return enviarCorreo({
    to: destinatarios.join(', '),
    cc,
    subject: `${titulo} · ${entrega}`,
    html: plantillaCorreo({
      titulo,
      parrafos: [
        'El conductor cargó un archivo adicional en SAP y escribió el motivo. El archivo anterior permanece en la entrega.',
      ],
      filas: [
        { etiqueta: 'Entrega', valor: numero },
        { etiqueta: 'Conductor', valor: nombre },
        { etiqueta: 'Documento', valor: documento },
        { etiqueta: 'Placa', valor: placa },
        { etiqueta: 'Archivos', valor: lista },
        { etiqueta: 'Observación', valor: nota },
      ],
      nota: 'Este envío no registra otra entrega.',
    }),
    text: `${titulo}. Entrega ${entrega}. Conductor ${conductor?.nombre || ''}. Documento ${conductor?.cedula || ''}. Placa ${conductor?.placa || ''}. Archivos: ${(archivos || []).join(', ')}. Observación: ${observacion}`,
  });
}

export async function enviarReporteConexionSoporte({ reporte, usuario }) {
  const to = config.auth.soporteEmail;
  const quien = usuario?.nombre || 'Anónimo';
  const correo = usuario?.email || reporte.usuario_email || 'N/A';
  return enviarCorreo({
    to,
    subject: `[Portal Cumplidos] Reporte sin conexión · ${reporte.tipo}`,
    html: plantillaCorreo({
      titulo: 'Reporte de conexión',
      filas: [
        { etiqueta: 'Usuario', valor: `${quien} (${correo})` },
        { etiqueta: 'Tipo', valor: reporte.tipo || '—' },
        { etiqueta: 'Mensaje', valor: reporte.mensaje || '—' },
        { etiqueta: 'Página', valor: reporte.pagina_url || '—' },
      ],
      nota: reporte.user_agent || '',
    }),
    text: `Reporte: ${reporte.mensaje} - ${correo}`,
  });
}
