const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const ConversationParticipant = require('../models/ConversationParticipant');
const Message = require('../models/Message');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { assertParticipant } = require('../services/participation');

const PREVIEW_LENGTH = 120;

// POST /api/conversations/:id/messages
const sendMessage = asyncHandler(async (req, res) => {
  const { id: conversationId } = req.params;
  if (!mongoose.isValidObjectId(conversationId)) throw new HttpError(400, 'Invalid conversation id.');

  await assertParticipant(conversationId, req.userId);

  const { content, messageType, attachments, replyToMessageId } = req.body;
  if (!content || typeof content !== 'string') {
    throw new HttpError(400, 'content is required.');
  }
  if (replyToMessageId && !mongoose.isValidObjectId(replyToMessageId)) {
    throw new HttpError(400, 'Invalid replyToMessageId.');
  }

  const message = await Message.create({
    conversation_id: conversationId,
    sender_id: req.userId,
    content,
    message_type: messageType || 'text',
    attachments: attachments || [],
    reply_to_message_id: replyToMessageId || null,
  });

  await Conversation.findByIdAndUpdate(conversationId, {
    $set: {
      last_message: {
        message_id: message._id,
        sender_id: req.userId,
        content_preview: content.slice(0, PREVIEW_LENGTH),
        sent_at: message.created_at,
      },
      updated_at: new Date(),
    },
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('message:new', message);
  }

  return res.status(201).json(message);
});

// GET /api/conversations/:id/messages?limit=30&before=<ISO date>
// Thread view: newest first, paged.
const listMessages = asyncHandler(async (req, res) => {
  const { id: conversationId } = req.params;
  if (!mongoose.isValidObjectId(conversationId)) throw new HttpError(400, 'Invalid conversation id.');

  await assertParticipant(conversationId, req.userId);

  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const before = req.query.before ? new Date(req.query.before) : null;

  const filter = { conversation_id: conversationId };
  if (before && !Number.isNaN(before.getTime())) {
    filter.created_at = { $lt: before };
  }

  const messages = await Message.find(filter).sort({ created_at: -1 }).limit(limit);

  return res.json(messages);
});

// POST /api/messages/:id/read  — marks everything up to :id as read for the caller.
const markRead = asyncHandler(async (req, res) => {
  const { id: messageId } = req.params;
  if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, 'Invalid message id.');

  const message = await Message.findById(messageId);
  if (!message) throw new HttpError(404, 'Message not found.');

  await assertParticipant(message.conversation_id, req.userId);

  const participant = await ConversationParticipant.findOneAndUpdate(
    { conversation_id: message.conversation_id, user_id: req.userId },
    { $set: { last_read_message_id: message._id, last_read_at: new Date() } },
    { new: true }
  );

  return res.json(participant);
});

// POST /api/messages/:id/reactions  { reaction }
const addReaction = asyncHandler(async (req, res) => {
  const { id: messageId } = req.params;
  if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, 'Invalid message id.');

  const { reaction } = req.body;
  if (!reaction || typeof reaction !== 'string') throw new HttpError(400, 'reaction is required.');

  const message = await Message.findById(messageId);
  if (!message) throw new HttpError(404, 'Message not found.');

  await assertParticipant(message.conversation_id, req.userId);

  // One reaction per user per message: replace, don't accumulate duplicates.
  message.reactions = message.reactions.filter((r) => r.user_id !== req.userId);
  message.reactions.push({ user_id: req.userId, reaction, created_at: new Date() });
  await message.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${message.conversation_id}`).emit('message:reaction', {
      messageId: message._id,
      reactions: message.reactions,
    });
  }

  return res.json(message);
});

// DELETE /api/messages/:id  — soft delete; only the sender may delete their own message.
const deleteMessage = asyncHandler(async (req, res) => {
  const { id: messageId } = req.params;
  if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, 'Invalid message id.');

  const message = await Message.findById(messageId);
  if (!message) throw new HttpError(404, 'Message not found.');
  if (message.sender_id !== req.userId) throw new HttpError(403, 'Only the sender can delete this message.');

  message.deleted_at = new Date();
  await message.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${message.conversation_id}`).emit('message:deleted', { messageId: message._id });
  }

  return res.json(message);
});

module.exports = { sendMessage, listMessages, markRead, addReaction, deleteMessage };
