import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { startKeepAlive } from './services/keepAlive.js';

async function main() {
  await connectDB(env.MONGODB_URI);
  const server = createApp().listen(env.PORT, () => {
    console.log(`✓ LifeNexus API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
  const keepAliveTimer = startKeepAlive();

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down gracefully`);
    clearInterval(keepAliveTimer);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('✖ Failed to start server:', err.message);
  process.exit(1);
});
