import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './pool.js';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let ensured = false;

const MIGRATION_OK_CODES = new Set([
  'ER_DUP_FIELDNAME',
  'ER_DUP_KEYNAME',
  'ER_TABLE_EXISTS_ERROR',
]);

/** Quita comentarios -- y devuelve sentencias SQL en orden */
function parseSqlStatements(sql) {
  const sinComentarios = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return sinComentarios
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runStatements(pool, statements, { ignoreDup = false } = {}) {
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (ignoreDup && MIGRATION_OK_CODES.has(err.code)) continue;
      throw err;
    }
  }
}

async function runMigrations(pool) {
  const migDir = path.join(__dirname, '../../sql/migrations');
  if (!fs.existsSync(migDir)) return 0;

  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  let total = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
    const statements = parseSqlStatements(sql);
    await runStatements(pool, statements, { ignoreDup: true });
    total += statements.length;
  }
  return total;
}

/**
 * Al arrancar la API: crea tablas faltantes + migraciones incrementales.
 * Desactivar con MYSQL_AUTO_MIGRATE=false
 */
export async function ensurePortalTables() {
  if (ensured) return;
  if (process.env.MYSQL_AUTO_MIGRATE === 'false') {
    ensured = true;
    return;
  }

  const sql = fs.readFileSync(path.join(__dirname, '../../sql/tables.sql'), 'utf8');
  const pool = getPool();
  const baseStatements = parseSqlStatements(sql);

  try {
    await runStatements(pool, baseStatements);
    const migCount = await runMigrations(pool);
    ensured = true;
    console.log(
      `✓ Tablas verificadas en ${config.mysql.database} (${baseStatements.length} base + ${migCount} migración)`
    );
  } catch (err) {
    console.error('No se pudieron verificar tablas del portal:', err.message);
    throw err;
  }
}
