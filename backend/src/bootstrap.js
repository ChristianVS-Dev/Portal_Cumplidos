import { getPool } from './db/pool.js';
import { ensurePortalTables } from './db/ensureTables.js';
import { config } from './config/index.js';

const MAX_RETRIES = 30;
const DELAY_MS = 2000;

async function waitForMysql() {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      await getPool().execute('SELECT 1');
    console.log('✓ MySQL conectado');
    await ensurePortalTables();
    return;
    } catch (err) {
      const detalle =
        err.message ||
        [err.code, err.errno != null ? `errno ${err.errno}` : null].filter(Boolean).join(' ') ||
        String(err);
      console.error(
        `  MySQL/init (${i}/${MAX_RETRIES}) ${config.mysql.host}:${config.mysql.port} →`,
        detalle
      );
      if (i === MAX_RETRIES) {
        throw new Error(`MySQL no disponible: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
}

await waitForMysql();

if (config.upload.purgeLegacyOnBoot) {
  try {
    const { purgarArchivosYaSincronizados } = await import('./services/adjuntos.service.js');
    await purgarArchivosYaSincronizados({ limit: 5000 });
  } catch (err) {
    console.warn('[adjuntos] Purga legacy al arranque falló:', err.message);
  }
}

const { default: startServer } = await import('./server.js');
startServer();
