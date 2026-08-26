const http = require('http');
const { Server } = require('socket.io');
const env = require('./config/env');
const { connectDb } = require('./config/db');
const { createApp } = require('./app');
const { registerSocketHandlers } = require('./sockets');
const { startGrpcServer, stopGrpcServer } = require('./grpc/server');

async function main() {
  await connectDb();
  console.log(`Connected to MongoDB database "${env.mongoDbName}".`);

  const app = createApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    },
  });
  registerSocketHandlers(io);
  app.set('io', io);

  server.listen(env.port, () => {
    console.log(`messaging-service listening on port ${env.port} (${env.nodeEnv}).`);
  });

  await startGrpcServer();

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down.`);
    Promise.all([
      new Promise((resolve) => server.close(resolve)),
      stopGrpcServer(),
    ]).then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start messaging-service:', err);
  process.exit(1);
});
