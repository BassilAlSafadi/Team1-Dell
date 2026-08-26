const grpc = require('@grpc/grpc-js');
const { HealthImplementation } = require('grpc-health-check');
const mongoose = require('mongoose');
const env = require('../config/env');
const { getConversationById } = require('../services/conversationCache');
const { assertParticipant } = require('../services/participation');
const { requireInternalCaller } = require('./internalAuth');
const { loadProto } = require('./protoLoader');

const messagingProto = loadProto('messaging/v1/messaging.proto').messaging.v1;

// Mirrors conversations.controller.js's getConversation query, INCLUDING its participation
// check. Without that check this was a way to read any conversation by id: the REST route
// enforced participation but the gRPC route (which the gateway prefers for this path) did not.
async function getConversation(call, callback) {
  try {
    const userId = requireInternalCaller(call);

    const { conversation_id: conversationId } = call.request;
    if (!mongoose.isValidObjectId(conversationId)) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, details: 'Invalid conversation id.' });
    }

    // Per the EERD's security rules, a conversation_id alone is never sufficient.
    await assertParticipant(conversationId, userId);

    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return callback({ code: grpc.status.NOT_FOUND, details: 'Conversation not found.' });
    }

    callback(null, {
      conversation_id: String(conversation._id),
      participants: conversation.participants.map((p) => ({ user_id: p.user_id, role: p.role })),
      listing_id: conversation.listing_id || '',
      last_message: conversation.last_message
        ? {
            message_id: String(conversation.last_message.message_id || ''),
            sender_id: conversation.last_message.sender_id || '',
            content_preview: conversation.last_message.content_preview || '',
            sent_at: conversation.last_message.sent_at
              ? { seconds: Math.floor(conversation.last_message.sent_at.getTime() / 1000), nanos: 0 }
              : null,
          }
        : null,
      created_at: { seconds: Math.floor(conversation.created_at.getTime() / 1000), nanos: 0 },
      updated_at: { seconds: Math.floor(conversation.updated_at.getTime() / 1000), nanos: 0 },
    });
  } catch (err) {
    // assertParticipant throws { status: 403 }; requireInternalCaller throws a gRPC-shaped
    // error already. Anything else is genuinely internal.
    if (err && typeof err.code === 'number') {
      return callback(err);
    }
    if (err && err.status === 403) {
      return callback({ code: grpc.status.PERMISSION_DENIED, details: err.message });
    }
    callback({ code: grpc.status.INTERNAL, details: err.message });
  }
}

let grpcServer = null;

function startGrpcServer() {
  grpcServer = new grpc.Server();

  grpcServer.addService(messagingProto.MessagingService.service, { GetConversation: getConversation });

  const healthImpl = new HealthImplementation({
    '': 'SERVING',
    'messaging.v1.MessagingService': 'SERVING',
  });
  healthImpl.addToServer(grpcServer);

  return new Promise((resolve, reject) => {
    grpcServer.bindAsync(`0.0.0.0:${env.grpcPort}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) return reject(err);
      console.log(`messaging-service gRPC server listening on port ${port}.`);
      resolve(grpcServer);
    });
  });
}

function stopGrpcServer() {
  return new Promise((resolve) => {
    if (!grpcServer) return resolve();
    grpcServer.tryShutdown(() => resolve());
  });
}

module.exports = { startGrpcServer, stopGrpcServer };
