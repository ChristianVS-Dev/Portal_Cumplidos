import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '.env.docker');
const target = path.join(root, '.env');

if (!fs.existsSync(source)) {
  console.warn('sync-env: no existe .env.docker');
  process.exit(0);
}

fs.copyFileSync(source, target);
console.log('sync-env: .env.docker → .env (Docker Compose lee .env automáticamente)');
