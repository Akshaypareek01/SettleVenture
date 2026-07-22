import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { runMigrations } from './config/migrate.js';
import { env } from './config/env.js';
import { logStorageConfig } from './services/r2.service.js';

/**
 * Starts the ApexLedger API server.
 */
async function main(): Promise<void> {
  await connectDb();
  await runMigrations();
  logStorageConfig();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`ApexLedger API running on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`${signal} received — shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    // Force-exit if connections refuse to drain
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
