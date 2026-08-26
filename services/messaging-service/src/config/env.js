require('dotenv').config();

const required = ['MONGODB_URI', 'JWT_SIGNING_KEY'];
const missing = required.filter((name) => !process.env[name] || process.env[name].startsWith('CHANGE_ME'));

if (missing.length > 0) {
  throw new Error(
    `Missing/placeholder environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill in real values.`
  );
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 8080,
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGO_DB_NAME || 'messaging_db',
  jwt: {
    issuer: process.env.JWT_ISSUER || 'auth-service',
    audience: process.env.JWT_AUDIENCE || 'circular-economy-marketplace',
    signingKey: process.env.JWT_SIGNING_KEY,
  },
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  grpcPort: Number(process.env.GRPC_PORT) || 6003,
  grpcPeers: {
    auth: process.env.AUTH_GRPC_ADDR,
    transaction: process.env.TRANSACTION_GRPC_ADDR,
    notification: process.env.NOTIFICATION_GRPC_ADDR,
    ai: process.env.AI_GRPC_ADDR,
  },
  // Optional — the cache-aside layer degrades to a straight Mongo read when this is unset
  // or still a placeholder, so it's deliberately not in the `required` list above.
  redisUrl:
    process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('CHANGE_ME')
      ? process.env.REDIS_URL
      : null,
};
