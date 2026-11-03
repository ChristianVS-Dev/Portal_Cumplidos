import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

let pool = null;

function mysqlDesactivado() {
  return Object.assign(
    new Error('MySQL/Intiva está desactivado. El portal usa Supabase.'),
    { status: 503, code: 'MYSQL_DESACTIVADO' }
  );
}

export function getPool() {
  if (!config.mysql.enabled) throw mysqlDesactivado();
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      namedPlaceholders: true,
      multipleStatements: false,
      /** DATE/TIME como '2026-06-03' y '14:30:00' — evita Date con zona horaria incorrecta */
      dateStrings: true,
    });
  }
  return pool;
}

export async function query(sql, params = {}) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
