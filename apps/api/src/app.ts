import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'apexledger-api' });
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
