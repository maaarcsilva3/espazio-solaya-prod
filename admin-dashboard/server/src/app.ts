import fs from 'fs';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { pool } from './db';
import { requireAuth } from './auth';
import { asyncHandler, errorHandler } from './http';
import { log } from './logger';
import { authRouter } from './routes/auth';
import { offeringsRouter } from './routes/offerings';
import { requestsRouter } from './routes/requests';
import { calendarRouter } from './routes/calendar';
import { adminsRouter } from './routes/admins';
import { statsRouter } from './routes/stats';
import { publicRouter } from './routes/public';
import { statusesRouter } from './routes/statuses';
import { inquiriesRouter } from './routes/inquiries';
import { pipelineStagesRouter } from './routes/pipelineStages';
import { agentsRouter } from './routes/agents';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.cookieSecure ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api')) {
        log('info', 'request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - started,
        });
      }
    });
    next();
  });

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    }),
  );

  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/offerings', requireAuth, offeringsRouter);
  app.use('/api/requests', requireAuth, requestsRouter);
  app.use('/api/calendar', requireAuth, calendarRouter);
  app.use('/api/admins', requireAuth, adminsRouter);
  app.use('/api/stats', requireAuth, statsRouter);
  app.use('/api/statuses', requireAuth, statusesRouter);
  app.use('/api/inquiries', requireAuth, inquiriesRouter);
  app.use('/api/pipeline-stages', requireAuth, pipelineStagesRouter);
  app.use('/api/agents', requireAuth, agentsRouter);

  app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
