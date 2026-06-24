/**
 * Genera frontend/.env.mobile a partir de .env.docker (raíz del repo).
 *
 * La APK NO conecta a MySQL ni al túnel SSH: solo llama al API Node del portal.
 * En dev con Docker, el emulador usa 10.0.2.2:3001 (API directo), no Vite :19080.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '.env.docker');
const target = path.join(root, 'frontend', '.env.mobile');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function emulatorHost(vars) {
  return (vars.MOBILE_HOST_IP || '10.0.2.2').trim();
}

function buildApiUrl(vars) {
  const explicit = (vars.MOBILE_API_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const target = (vars.MOBILE_API_TARGET || 'emulator').toLowerCase();
  const host = emulatorHost(vars);

  if (target === 'server') {
    const cors = (vars.CORS_ORIGIN || '').split(',')[0].trim();
    if (cors && !cors.includes('localhost')) {
      return `${cors.replace(/\/$/, '')}/api/v1`;
    }
  }

  if (target === 'device') {
    const ip = (vars.MOBILE_HOST_IP || '').trim();
    if (!ip) {
      console.warn('sync-env-mobile: MOBILE_API_TARGET=device pero falta MOBILE_HOST_IP');
    }
    const port = vars.MOBILE_API_PORT || vars.WEB_HOST_PORT || '19080';
    return `http://${ip || '192.168.0.1'}:${port}/api/v1`;
  }

  // emulator (default): API directo en Docker dev (puerto 3001), no Vite/nginx
  const direct = vars.MOBILE_API_DIRECT !== 'false';
  const port = direct ? vars.MOBILE_API_PORT || '3001' : vars.WEB_HOST_PORT || '19080';
  return `http://${host}:${port}/api/v1`;
}

if (!fs.existsSync(source)) {
  console.warn('sync-env-mobile: no existe .env.docker en la raíz del repo');
  console.warn(
    '  Cree .env.docker desde .env.docker.example o copie frontend/.env.mobile.example a frontend/.env.mobile'
  );
  process.exit(0);
}

const vars = parseEnvFile(source);
const apiUrl = buildApiUrl(vars);
const portalKey = vars.PORTAL_API_KEY || '';

const content = `# Generado por: npm run sync:env:mobile
# APK → API Node del portal (Docker en su PC/servidor). MySQL/SSH solo en el contenedor api.

VITE_API_URL=${apiUrl}
VITE_PORTAL_API_KEY=${portalKey}
`;

fs.writeFileSync(target, content, 'utf8');
console.log('sync-env-mobile: .env.docker → frontend/.env.mobile');
console.log(`  VITE_API_URL=${apiUrl}`);
console.log('  Requiere: npm run docker:dev:all (api + túnel + web) y luego npm run mobile:sync');
