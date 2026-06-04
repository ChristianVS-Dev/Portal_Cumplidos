import path from 'path';
import archiver from 'archiver';
import { PassThrough } from 'stream';

function nombreUnicoEnZip(nombre, usados) {
  let n = path.basename(nombre) || 'documento';
  if (!usados.has(n)) {
    usados.add(n);
    return n;
  }
  const ext = path.extname(n);
  const base = path.basename(n, ext) || 'documento';
  let i = 2;
  while (usados.has(`${base}_${i}${ext}`)) i += 1;
  n = `${base}_${i}${ext}`;
  usados.add(n);
  return n;
}

/**
 * Genera un .zip con varios archivos (un ZIP por confirmación del paso 3).
 * @param {{ buffer: Buffer, name: string }[]} entradas
 */
export function archivosAZip(entradas) {
  if (!entradas?.length) {
    return Promise.reject(new Error('No hay archivos para comprimir'));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.pipe(passthrough);

    const usados = new Set();
    for (const { buffer, name } of entradas) {
      if (!buffer?.length) continue;
      archive.append(buffer, { name: nombreUnicoEnZip(name, usados) });
    }
    archive.finalize();
  });
}

/** Nombre del .zip único enviado a SAP por registro de cumplido */
export function nombreZipBundleParaSap(numeroEntrega, cumplidoId) {
  const vbeln = String(numeroEntrega || 'entrega')
    .trim()
    .replace(/[^\w\-]/gi, '_')
    .slice(0, 40);
  const sufijo = String(cumplidoId || '').replace(/-/g, '').slice(0, 8);
  return `cumplido_${vbeln}_${sufijo || 'bundle'}.zip`;
}
