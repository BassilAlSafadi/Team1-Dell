const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { assertParticipant } = require('../services/participation');

function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Missing auth token.'));

  try {
    const payload = jwt.verify(token, env.jwt.signingKey, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
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

    socket.on('typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('typing', {
        conversationId,
        userId: socket.userId,
        isTyping: Boolean(isTyping),
      });
    });
  });
}

module.exports = { registerSocketHandlers };
