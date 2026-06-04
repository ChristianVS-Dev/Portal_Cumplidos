import { Router } from 'express';
import * as entregasCtrl from '../controllers/entregas.controller.js';
import * as transportesCtrl from '../controllers/transportes.controller.js';
import * as cumplidosCtrl from '../controllers/cumplidos.controller.js';
import { upload, parseCumplidoBody, mapArchivosConTipo } from '../middleware/upload.js';
import { rateLimitAdjuntos, rateLimitBuscar } from '../middleware/security.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'portal-cumplidos-api', timestamp: new Date().toISOString() });
});

router.get('/entregas/:numero/detalle', rateLimitBuscar, entregasCtrl.detalle);
router.get('/entregas/:numero', rateLimitBuscar, entregasCtrl.buscar);
router.post('/entregas/:numero/visita', rateLimitBuscar, entregasCtrl.registrarVisita);
router.post('/transportes/:tknum/entregas/:vbeln', transportesCtrl.seleccionarEntrega);
/** Métricas del header: sin BD por defecto (METRICAS_USE_DB=true para leer MySQL) */
router.get('/metricas', (req, res, next) => {
  if (process.env.METRICAS_USE_DB === 'true') {
    return cumplidosCtrl.metricas(req, res, next);
  }
  res.json({
    ok: true,
    data: {
      exitosas: 0,
      novedades: 0,
      documentos: 0,
      entregasSap: 0,
      tasaExito: null,
      ultimaPlaca: null,
      ultimoRegistro: null,
      fuente: 'estatica',
    },
  });
});
router.get('/cumplidos/:id', cumplidosCtrl.obtener);

router.post(
  '/cumplidos/:id/adjuntos',
  rateLimitAdjuntos,
  upload.single('archivo'),
  cumplidosCtrl.subirAdjunto
);
router.patch('/cumplidos/:id/borrador', cumplidosCtrl.actualizarBorrador);
router.patch('/cumplidos/:id/completar', cumplidosCtrl.completar);

router.post(
  '/cumplidos',
  rateLimitAdjuntos,
  upload.array('archivos', 20),
  parseCumplidoBody,
  mapArchivosConTipo,
  cumplidosCtrl.crear
);

router.post('/adjuntos/:adjuntoId/reintentar', cumplidosCtrl.reintentarAdjunto);

export default router;
