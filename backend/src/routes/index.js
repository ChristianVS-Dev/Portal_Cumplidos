import { Router } from 'express';
import * as entregasCtrl from '../controllers/entregas.controller.js';
import * as transportesCtrl from '../controllers/transportes.controller.js';
import * as cumplidosCtrl from '../controllers/cumplidos.controller.js';
import { upload, parseCumplidoBody, mapArchivosConTipo } from '../middleware/upload.js';
import {
  rateLimitAdjuntos,
  rateLimitBuscar,
  rateLimitIngreso,
  rateLimitCuenta,
  rateLimitRecuperar,
  rateLimitRegistro,
  requireSesion,
} from '../middleware/security.js';
import * as accesoCtrl from '../controllers/acceso-conductor.controller.js';
import * as empresaCtrl from '../controllers/empresa.controller.js';

const router = Router();

const SIN_SESION = new Set([
  'GET /health',
  'POST /auth/ingreso',
  'POST /auth/registro',
  'POST /auth/recuperar',
  'POST /auth/restablecer',
  'POST /auth/confirmar',
  'POST /auth/confirmar/reenviar',
  'GET /auth/sesion',
  'POST /auth/salir',
  'POST /conductores',
]);

function firma(req) {
  const base = req.baseUrl || '';
  let path = (req.originalUrl || req.url || '').split('?')[0];
  if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
  return `${req.method} ${path}`;
}

router.use((req, res, next) => {
  if (SIN_SESION.has(firma(req))) return next();
  return requireSesion(req, res, next);
});

router.post('/conductores', rateLimitRegistro, accesoCtrl.crearConductor);
router.post('/auth/ingreso', rateLimitIngreso, rateLimitCuenta, accesoCtrl.ingresar);
router.post('/auth/registro', rateLimitRegistro, rateLimitCuenta, accesoCtrl.registrar);
router.post('/auth/confirmar', rateLimitRecuperar, accesoCtrl.confirmar);
router.post('/auth/confirmar/reenviar', rateLimitRecuperar, rateLimitCuenta, accesoCtrl.reenviarConfirmacion);
router.post('/auth/recuperar', rateLimitRecuperar, rateLimitCuenta, accesoCtrl.recuperar);
router.post('/auth/restablecer', rateLimitRecuperar, accesoCtrl.restablecer);
router.get('/auth/sesion', accesoCtrl.sesion);
router.post('/auth/salir', accesoCtrl.salir);
router.get('/empresa/entregas', rateLimitBuscar, empresaCtrl.listar);
router.get('/empresa/entregas/:numero', rateLimitBuscar, empresaCtrl.detalle);

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'portal-cumplidos-api', timestamp: new Date().toISOString() });
});

router.get('/entregas/:numero/adjuntos/:docId', rateLimitAdjuntos, entregasCtrl.abrirAdjunto);
router.delete('/entregas/:numero/adjuntos/:docId', rateLimitAdjuntos, entregasCtrl.eliminarAdjunto);
router.post(
  '/entregas/:numero/adjuntos',
  rateLimitAdjuntos,
  upload.array('archivos', 10),
  entregasCtrl.reemplazarAdjuntos
);
router.get('/entregas/:numero/adjuntos', rateLimitBuscar, entregasCtrl.listarAdjuntos);
router.get('/entregas/:numero/detalle', rateLimitBuscar, entregasCtrl.detalle);
router.get('/entregas/:numero/ruta', rateLimitBuscar, entregasCtrl.ruta);
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
