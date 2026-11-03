import { config } from './config/index.js';
import { getSupabase, supabaseConfigurado } from './db/supabase.js';

const MAX_RETRIES = 30;
const DELAY_MS = 2000;

async function waitForMysql() {
  const { getPool } = await import('./db/pool.js');
  const { ensurePortalTables } = await import('./db/ensureTables.js');
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      await getPool().execute('SELECT 1');
      console.log('✓ MySQL/Intiva conectado');
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

async function comprobarSupabase() {
  if (!supabaseConfigurado()) {
    console.error('[supabase] Falta SUPABASE_URL o SUPABASE_SECRET_KEY. El acceso responderá no disponible.');
    return;
  }
  const { error } = await getSupabase().from('pc_conductor').select('id').limit(1);
  if (error) {
    console.error('[supabase] No se pudo consultar el portal:', error.message);
    return;
  }
  console.log('✓ Supabase portal conectado');
}

if (config.mysql.enabled) {
  await waitForMysql();
  if (config.upload.purgeLegacyOnBoot) {
    try {
      const { purgarArchivosYaSincronizados } = await import('./services/adjuntos.service.js');
      await purgarArchivosYaSincronizados({ limit: 5000 });
    } catch (err) {
      console.warn('[adjuntos] Purga legacy al arranque falló:', err.message);
    }
  }
} else {
  console.log('MySQL/Intiva desactivado. Se conserva el código; MYSQL_ENABLED=true para volver a usarlo.');
  await comprobarSupabase();
}

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
