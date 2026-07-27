import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Orígenes Capacitor (WebView Android/iOS) para app móvil del portal */
const CAPACITOR_CORS_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

function buildCorsOrigins() {
  const fromEnv = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8080')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.CORS_ALLOW_CAPACITOR === 'false') return [...new Set(fromEnv)];
  return [...new Set([...fromEnv, ...CAPACITOR_CORS_ORIGINS])];
}

/** Clave del portal; si ENTREGAS_API_TOKEN está vacío, se usa la misma para la API externa */
const portalApiKey = (process.env.PORTAL_API_KEY || '').trim();
const entregasApiToken = (process.env.ENTREGAS_API_TOKEN || portalApiKey).trim();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8080')
    .split(',')
    .map((s) => s.trim()),
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'portal_cumplidos',
  },
  sap: {
    useMock: process.env.SAP_USE_MOCK !== 'false',
    baseUrl: process.env.SAP_BASE_URL || '',
    user: process.env.SAP_USER || '',
    password: process.env.SAP_PASSWORD || '',
    client: process.env.SAP_CLIENT || '',
    /** Adjuntos a SAP como .zip (un archivo por ZIP); desactivar solo para pruebas */
    adjuntosComoZip: process.env.SAP_ADJUNTOS_ZIP !== 'false',
  },
  entregasExterna: {
    useMock: process.env.ENTREGAS_USE_MOCK === 'true',
    baseUrl: process.env.ENTREGAS_API_BASE_URL || 'http://10.10.10.5:8100/api/entregas',
    timeoutMs: parseInt(process.env.ENTREGAS_TIMEOUT_MS || '20000', 10),
    /** Subida ZIP a SAP: timeout propio (no usar ENTREGAS_TIMEOUT_MS; las consultas son más rápidas) */
    adjuntosTimeoutMs: parseInt(process.env.ENTREGAS_ADJUNTOS_TIMEOUT_MS || '180000', 10),
    enabled: process.env.ENTREGAS_API_ENABLED !== 'false',
    /** Token API entregas/transportes/adjuntos (ENTREGAS_API_TOKEN o PORTAL_API_KEY) */
    token: entregasApiToken,
    tokenHeader: process.env.ENTREGAS_API_TOKEN_HEADER || 'Authorization',
    tokenPrefix:
      process.env.ENTREGAS_API_TOKEN_PREFIX !== undefined
        ? process.env.ENTREGAS_API_TOKEN_PREFIX
        : 'Bearer',
    /** GET consulta con token (la API externa lo exige). false solo para pruebas */
    sendTokenOnRead: process.env.ENTREGAS_API_SEND_TOKEN_ON_READ !== 'false',
  },
  transportes: {
    useMock: process.env.TRANSPORTES_USE_MOCK === 'true',
    baseUrl:
      process.env.TRANSPORTES_API_BASE_URL || 'http://10.10.10.5:8100/api/transportes',
    timeoutMs: parseInt(process.env.TRANSPORTES_TIMEOUT_MS || '20000', 10),
    enabled: process.env.TRANSPORTES_ENABLED !== 'false',
  },
  metricas: {
    /** false = responde ceros sin consultar MySQL (hasta tener BD de métricas lista) */
    useDb: process.env.METRICAS_USE_DB === 'true',
  },
  /** false = solo consulta APIs externas, no escribe en MySQL al buscar entrega */
  persistirCumplidos:
    process.env.PERSISTIR_CUMPLIDOS_MYSQL !== 'false' &&
    process.env.PERSISTIR_CUMPLIDOS_MYSQL !== '0',
  upload: {
    dir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads')),
    maxSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
    /** Tras sync SAP ok: borrar archivos locales (libera disco; metadatos quedan en MySQL) */
    purgeAfterSapOk: process.env.UPLOAD_PURGE_AFTER_SAP_OK !== 'false',
    /** Al arrancar: purgar archivos locales de adjuntos ya sync ok (mantenimiento) */
    purgeLegacyOnBoot: process.env.UPLOAD_PURGE_LEGACY_ON_BOOT === 'true',
  },
  /** Seguridad sin login: clave de portal + rate limit */
  portal: {
    apiKey: portalApiKey,
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '150', 10),
    rateLimitBuscarMax: parseInt(process.env.RATE_LIMIT_BUSCAR_MAX || '40', 10),
    rateLimitAdjuntosMax: parseInt(process.env.RATE_LIMIT_ADJUNTOS_MAX || '60', 10),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion',
    jwtExpires: process.env.JWT_EXPIRES || '8h',
    devMode: process.env.AUTH_DEV_MODE === 'true',
    resetExpiresMin: parseInt(process.env.RESET_TOKEN_MIN || '60', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    soporteEmail: process.env.SOPORTE_EMAIL || 'soporte.logistica@grupodecor.com',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Portal Cumplidos <noreply@grupodecor.com>',
  },
};

export function assertProductionSecurity() {
  if (config.nodeEnv !== 'production') return;

  const warnings = [];
  if (!config.portal.apiKey) {
    warnings.push('PORTAL_API_KEY no definida (portal accesible sin clave compartida)');
  }
  if (config.auth.jwtSecret === 'dev-secret-cambiar-en-produccion') {
    warnings.push('JWT_SECRET por defecto (solo si activa auth más adelante)');
  }
  if (!config.mysql.password || config.mysql.password === 'portal_pass') {
    warnings.push('MYSQL_PASSWORD débil o por defecto');
  }
  if (warnings.length) {
    console.warn('⚠️ Seguridad producción:', warnings.join(' · '));
  }
}
