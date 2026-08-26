const Redis = require('ioredis');
const env = require('./env');

let client = null;

// Lazily-constructed shared client, reused across requests (mirrors the single shared
// mongoose connection in db.js). Returns null when REDIS_URL isn't configured — every
// caller must treat that as "cache disabled, go straight to the DB."
function getRedisClient() {
  if (!env.redisUrl) return null;

  if (!client) {
    client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    client.on('error', (err) => {
      console.error('[redis] connection error (falling back to DB reads):', err.message);
    });
  }

  return client;
}

module.exports = { getRedisClient };
