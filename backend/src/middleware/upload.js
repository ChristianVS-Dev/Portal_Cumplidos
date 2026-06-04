import multer from 'multer';
import { config } from '../config/index.js';
import { validarArchivoMeta } from '../services/adjuntos.service.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    try {
      validarArchivoMeta(file);
      cb(null, true);
    } catch (err) {
      cb(err);
    }
  },
});

export function parseCumplidoBody(req, _res, next) {
  const body = req.body?.data ? JSON.parse(req.body.data) : req.body;
  req.cumplidoData = body;
  next();
}

export function mapArchivosConTipo(req, _res, next) {
  const tipos = req.body?.tipos;
  let tiposArr = [];
  if (typeof tipos === 'string') {
    try {
      tiposArr = JSON.parse(tipos);
    } catch {
      tiposArr = tipos.split(',');
    }
  } else if (Array.isArray(tipos)) {
    tiposArr = tipos;
  }

  req.archivosMapeados = (req.files || []).map((f, i) => ({
    ...f,
    tipo: tiposArr[i] || 'cumplido',
  }));
  next();
}
