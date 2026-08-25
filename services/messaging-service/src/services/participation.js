const ConversationParticipant = require('../models/ConversationParticipant');

// Per the EERD's security rules: a conversation_id alone must never be sufficient
// to read a thread — every access is filtered by the caller's own user_id.
async function assertParticipant(conversationId, userId) {
  const participant = await ConversationParticipant.findOne({
    conversation_id: conversationId,
    user_id: userId,
  });
  if (!participant) {
    const err = new Error('Not a participant of this conversation.');
    err.status = 403;
    throw err;
  }
  return participant;
}

module.exports = { assertParticipant };
