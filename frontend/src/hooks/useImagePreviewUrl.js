import { useEffect, useState } from 'react';
import { crearUrlMiniatura, esImagenPreview, revocarUrlPreview } from '../utils/imagePreview.js';

/**
 * Una sola URL blob por archivo; se libera al cambiar o desmontar.
 */
export function useImagePreviewUrl(file) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!file || !esImagenPreview(file)) {
      setUrl(null);
      return undefined;
    }

    let activo = true;
    let objectUrl = null;

    crearUrlMiniatura(file).then((nuevaUrl) => {
      if (!activo) {
        revocarUrlPreview(nuevaUrl);
        return;
      }
      objectUrl = nuevaUrl;
      setUrl(nuevaUrl);
    });

    return () => {
      activo = false;
      revocarUrlPreview(objectUrl);
      setUrl(null);
    };
  }, [file]);

  return url;
}
