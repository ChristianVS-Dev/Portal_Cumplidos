/** Tamaño máximo de miniatura en grid (px). Reduce RAM en PCs con pocos recursos. */
const PREVIEW_MAX_PX = 160;
const THUMB_JPEG_QUALITY = 0.72;

export function esImagenPreview(file) {
  const ext = file?.name?.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png'].includes(ext);
}

export function revocarUrlPreview(url) {
  if (url?.startsWith?.('blob:')) URL.revokeObjectURL(url);
}

/**
 * Miniatura JPEG para la cuadrícula de previsualización.
 * Ocupa mucho menos memoria que cargar la foto completa en cada render.
 */
export async function crearUrlMiniatura(file, maxPx = PREVIEW_MAX_PX) {
  if (!file) return null;
  if (typeof createImageBitmap !== 'function') {
    return URL.createObjectURL(file);
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(maxPx / bitmap.width, maxPx / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob'))),
        'image/jpeg',
        THUMB_JPEG_QUALITY
      );
    });
    return URL.createObjectURL(blob);
  } catch {
    return URL.createObjectURL(file);
  }
}
