const NOMBRE = 'pc_sesion';
const MAX_AGE = 16 * 60 * 60;

function hostPublico(req) {
  const forwarded = req.headers['x-forwarded-host']?.toString().split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return (req.headers.host || '').toString().split(',')[0].trim();
}

function origenUrl(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function atributos(req, valor, maxAge) {
  const proto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const https = proto === 'https' || Boolean(req.secure);
  const origen = origenUrl(req);
  const cruzado = Boolean(origen && origen.host !== hostPublico(req));
  const sameSite = https && cruzado ? 'None' : 'Lax';
  const partes = [
    `${NOMBRE}=${valor}`,
    'HttpOnly',
    'Path=/api',
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
  ];
  if (https) partes.push('Secure');
  return partes.join('; ');
}

export function establecerCookieSesion(res, req, token) {
  res.append('Set-Cookie', atributos(req, encodeURIComponent(token), MAX_AGE));
  res.set('Cache-Control', 'no-store');
}

export function limpiarCookieSesion(res, req) {
  res.append('Set-Cookie', atributos(req, '', 0));
  res.set('Cache-Control', 'no-store');
}

export function leerCookieSesion(req) {
  const raw = req.headers.cookie || '';
  for (const parte of raw.split(';')) {
    const item = parte.trim();
    if (!item.startsWith(`${NOMBRE}=`)) continue;
    try {
      return decodeURIComponent(item.slice(NOMBRE.length + 1));
    } catch {
      return '';
    }
  }
  return '';
}
