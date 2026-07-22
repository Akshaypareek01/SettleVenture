import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

/**
 * Starts the ApexLedger API server.
 */
async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`ApexLedger API running on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
