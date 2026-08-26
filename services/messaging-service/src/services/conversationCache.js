const Conversation = require('../models/Conversation');
const { getRedisClient } = require('../config/redis');

// Cache-aside for conversation lookups (REDIS_INTEGRATION_PLAN.md §2): pure TTL expiry,
// no write-invalidation — a stale conversation read for up to TTL_SECONDS is an acceptable
// tradeoff for this entity (unlike wallet balance / unread count elsewhere in the mesh).
const TTL_SECONDS = 45;
const keyFor = (id) => `cache:messaging:conversation:${id}`;

function reviveDates(conv) {
  if (!conv) return conv;
  if (conv.created_at) conv.created_at = new Date(conv.created_at);
  if (conv.updated_at) conv.updated_at = new Date(conv.updated_at);
  if (conv.last_message && conv.last_message.sent_at) {
    conv.last_message.sent_at = new Date(conv.last_message.sent_at);
  }
  return conv;
}

// Returns a plain object (never a mongoose document) so behavior is identical whether the
// result came from cache or from Mongo. Shared by the REST controller and the gRPC handler
// so there's exactly one cache-aside code path for this read, not two.
async function getConversationById(id) {
  const redis = getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(keyFor(id));
      if (cached) return reviveDates(JSON.parse(cached));
    } catch (err) {
      console.error('[cache] messaging conversation read failed, falling back to Mongo:', err.message);
    }
  }

  const conversation = await Conversation.findById(id);
  if (!conversation) return null;

  const plain = conversation.toObject();

  if (redis) {
    try {
      await redis.set(keyFor(id), JSON.stringify(plain), 'EX', TTL_SECONDS);
    } catch (err) {
      console.error('[cache] messaging conversation write failed:', err.message);
    }
  }

  return plain;
}

module.exports = { getConversationById };
