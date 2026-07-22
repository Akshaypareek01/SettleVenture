import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import venturesRoutes from './routes/ventures.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import filesRoutes from './routes/files.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { env } from './config/env.js';

/**
 * Creates and configures the Express application.
 */
export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
  });
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'connected' : 'disconnected',
      service: 'apexledger-api',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/ventures', venturesRoutes);
  app.use('/api/ventures/:ventureId/transactions', transactionsRoutes);
  app.use('/api/ventures/:ventureId/invoices', invoicesRoutes);
  app.use('/api/files', filesRoutes);

  app.use(errorHandler);
  return app;
}
