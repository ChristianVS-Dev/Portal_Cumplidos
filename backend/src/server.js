import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import {
  portalApiKey,
  rateLimitGeneral,
} from './middleware/security.js';
import { assertProductionSecurity } from './config/index.js';

const app = express();

assertProductionSecurity();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(portalApiKey);
app.use(rateLimitGeneral);
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default function startServer() {
  app.listen(config.port, () => {
    console.log(`API Portal Cumplidos → http://localhost:${config.port}`);
    console.log(`  CORS orígenes: ${config.corsOrigins.join(', ')}`);
    console.log(
      `  Timeouts ms: entregas=${config.entregasExterna.timeoutMs}, adjuntos=${config.entregasExterna.adjuntosTimeoutMs}, transportes=${config.transportes.timeoutMs}`
    );
    console.log(`  SAP modo: ${config.sap.useMock ? 'MOCK' : 'REAL'}`);
    console.log(`  MySQL: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
  });
  return app;
}
