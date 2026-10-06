import { createApp, listenConfig, attachServer } from './src/app.js';
import { attachPoolPusher } from './src/ws/poolPusher.js';
import { connectMongo } from './src/db/index.js';
import { ensureIndexes } from './src/db/indexes.js';
import { closeMongo } from './src/db/index.js';
import { logServer, logError } from './src/utils/logger.js';

async function startServer() {
  try {
    // Initialize MongoDB connection
    logServer('Initializing MongoDB...');
    const db = await connectMongo();

    // Ensure required indexes exist
    await ensureIndexes(db);
    logServer('MongoDB indexes ensured');

    // Create and start HTTP server
    const server = createApp().listen(listenConfig.port, listenConfig.host);

    // Attach WebSocket pool pusher
    const poolPusher = attachPoolPusher(server);

    // Attach graceful shutdown handlers
    attachServer(server, undefined, async () => {
      poolPusher.close();
      await closeMongo();
    });

    logServer('Server startup complete');
    return server;
  } catch (error) {
    logError('STARTUP', `Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();

export default null; // Server is started asynchronously