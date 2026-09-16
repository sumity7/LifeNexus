import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { apiLimiter, apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  // Only redirects when a reverse proxy is explicitly configured (TRUST_PROXY set) — otherwise
  // req.secure can't be determined reliably and this would risk a redirect loop.
  if (env.isProd && env.TRUST_PROXY) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    });
  }

  app.use(compression());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Document previews render authorised files as blob: URLs.
          'img-src': ["'self'", 'data:', 'blob:'],
          'frame-src': ["'self'", 'blob:'],
          'object-src': ["'none'"],
        },
      },
    }),
  );
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok', database: mongoose.connection.readyState === 1 ? 'up' : 'down' } });
  });

  app.use('/api', apiLimiter, apiRouter);
  app.use('/api', notFoundHandler);

  // In production the API also serves the built SPA.
  if (env.isProd && fs.existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // Missing hashed assets must 404 (never fall through to index.html).
    app.use('/assets', (_req, res) => res.status(404).end());
    app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
