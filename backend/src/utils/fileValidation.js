const FIRMAS = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/jpg': [[0xff, 0xd8, 0xff]],
};

function coincideFirma(buffer, firma) {
  if (!buffer || buffer.length < firma.length) return false;
  return firma.every((byte, i) => buffer[i] === byte);
}

/** Valida que el contenido coincida con el MIME declarado (anti suplantación básica) */
export function validarContenidoArchivo(buffer, mimeType) {
  const firmas = FIRMAS[mimeType];
  if (!firmas) return false;
  return firmas.some((firma) => coincideFirma(buffer, firma));
}
