import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeId(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

/**
 * Inicialización segura:
 * - Solo CREATE TABLE IF NOT EXISTS
 * - No DROP / TRUNCATE / DELETE
 * - Trabaja únicamente sobre MYSQL_DATABASE
 * - Opcional: CREATE DATABASE IF NOT EXISTS (MYSQL_CREATE_DATABASE=true)
 */
async function init() {
  const tablesPath = path.join(__dirname, '../../sql/tables.sql');
  const sql = fs.readFileSync(tablesPath, 'utf8');
  const dbName = config.mysql.database;
  const createDatabase = process.env.MYSQL_CREATE_DATABASE === 'true';

  console.log(`Base objetivo: ${dbName}`);
  console.log(`Crear BD si no existe: ${createDatabase ? 'sí' : 'no (solo tablas)'}`);

  const baseConfig = {
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    multipleStatements: true,
  };

  if (createDatabase) {
    const admin = await mysql.createConnection(baseConfig);
    try {
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS ${escapeId(dbName)}
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log(`✓ Base ${dbName} verificada/creada`);
    } finally {
      await admin.end();
    }
  }

  const connection = await mysql.createConnection({ ...baseConfig, database: dbName });

  try {
    await connection.query(sql);
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✓ Tablas del portal listas (${tables.length} en ${dbName})`);
    console.log('  · pc_entrega_sap, pc_registro_cumplido, pc_adjunto, pc_auditoria');
    console.log('  · Sin borrado de datos existentes');
  } catch (err) {
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(
        `La base "${dbName}" no existe. Cree la base manualmente o ejecute con MYSQL_CREATE_DATABASE=true`
      );
    }
    throw err;
  } finally {
    await connection.end();
  }
}

init().catch((err) => {
  console.error('Error al inicializar tablas:', err.message);
  process.exit(1);
});
