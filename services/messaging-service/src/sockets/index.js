const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { assertParticipant } = require('../services/participation');

function authenticateSocket(socket, next) {
  // handshake.auth only — a token in handshake.query ends up in the connection URL, which the
  // gateway's request logger and any intermediate proxy will happily write to disk.
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Missing auth token.'));

  try {
    const payload = jwt.verify(token, env.jwt.signingKey, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithms: ['HS256'],
    });
    if (!payload.sub) return next(new Error('Token has no subject claim.'));
    socket.userId = payload.sub;
    return next();
  } catch (err) {
    return next(new Error('Invalid or expired token.'));
  }
}

function registerSocketHandlers(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    socket.on('conversation:join', async (conversationId, ack) => {
      try {
        await assertParticipant(conversationId, socket.userId);
        socket.join(`conversation:${conversationId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Participation is checked here for the same reason it is on conversation:join — without
    // it, any authenticated socket could emit typing into any conversation room, revealing its
    // user id to that thread and faking presence in a conversation it has no part in.
    socket.on('typing', async ({ conversationId, isTyping } = {}) => {
      if (!conversationId) return;

      try {
        await assertParticipant(conversationId, socket.userId);
      } catch {
        return;
      }

      socket.to(`conversation:${conversationId}`).emit('typing', {
        conversationId,
        userId: socket.userId,
        isTyping: Boolean(isTyping),
      });
    });
  });
}

module.exports = { registerSocketHandlers };
