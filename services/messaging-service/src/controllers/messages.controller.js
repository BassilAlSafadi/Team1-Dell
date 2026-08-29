const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const ConversationParticipant = require('../models/ConversationParticipant');
const Message = require('../models/Message');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { assertParticipant } = require('../services/participation');
const { notificationClient } = require('../grpc/clients');

const PREVIEW_LENGTH = 120;
const MAX_CONTENT_LENGTH = 8000;
const MAX_REACTION_LENGTH = 32;
const MAX_ATTACHMENTS = 10;

// POST /api/conversations/:id/messages
const sendMessage = asyncHandler(async (req, res) => {
  const { id: conversationId } = req.params;
  if (!mongoose.isValidObjectId(conversationId)) throw new HttpError(400, 'Invalid conversation id.');

  await assertParticipant(conversationId, req.userId);

  const { content, messageType, attachments, replyToMessageId } = req.body;

  const text = typeof content === 'string' ? content : '';
  if (attachments !== undefined && (!Array.isArray(attachments) || attachments.length > MAX_ATTACHMENTS)) {
    throw new HttpError(400, `attachments must be an array of at most ${MAX_ATTACHMENTS} items.`);
  }
  const cleanAttachments = normalizeAttachments(attachments);
  // A message must carry something — text, an attachment, or both.
  if (!text && cleanAttachments.length === 0) {
    throw new HttpError(400, 'content or an attachment is required.');
  }
  // Unbounded content/attachments went straight into the document; cap them so one request
  // can't write an arbitrarily large record.
  if (text.length > MAX_CONTENT_LENGTH) {
    throw new HttpError(400, `content must be at most ${MAX_CONTENT_LENGTH} characters.`);
  }
  if (replyToMessageId && !mongoose.isValidObjectId(replyToMessageId)) {
    throw new HttpError(400, 'Invalid replyToMessageId.');
  }

  const resolvedType =
    messageType && messageType !== 'text'
      ? messageType
      : cleanAttachments.length > 0
        ? attachmentKind(cleanAttachments[0].type)
        : 'text';
  const preview = text || `📎 ${cleanAttachments[0]?.name || 'attachment'}`;

  const message = await Message.create({
    conversation_id: conversationId,
    sender_id: req.userId,
    content: text || preview,
    message_type: resolvedType,
    attachments: cleanAttachments,
    reply_to_message_id: replyToMessageId || null,
  });

  const conversation = await Conversation.findByIdAndUpdate(conversationId, {
    $set: {
      last_message: {
        message_id: message._id,
        sender_id: req.userId,
        content_preview: preview.slice(0, PREVIEW_LENGTH),
        sent_at: message.created_at,
      },
      updated_at: new Date(),
    },
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('message:new', message);
  }

  // Best-effort: a notification-service outage must never break sending a message.
  notifyOtherParticipants(conversation, conversationId, req.userId, preview).catch((err) => {
    console.error('Failed to notify conversation participants:', err.message);
  });

  return res.status(201).json(message);
});

// Notifies every other participant of a direct conversation about a new message. Participant
// ids here are genuine auth-service user ids (Conversation.participants[].user_id), unlike
// transaction-service's buyer_id/seller_id.
function notifyOtherParticipants(conversation, conversationId, senderId, content) {
  if (!notificationClient || !conversation) return Promise.resolve();

  const recipients = conversation.participants.filter((p) => p.user_id !== senderId);

  return Promise.all(
    recipients.map(
      (recipient) =>
        new Promise((resolve, reject) => {
          notificationClient.CreateNotification(
            {
              user_id: recipient.user_id,
              type: 'NEW_MESSAGE',
              title: 'New message',
              body: content.slice(0, PREVIEW_LENGTH), // caller passes the already-built preview
              actor_id: senderId,
              entity: { type: 'conversation', id: conversationId },
            },
            (err) => (err ? reject(err) : resolve())
          );
        })
    )
  );
}

// Validates and trims the attachments array to the { url, type, name, size } shape the
// Message schema stores. `url` must be one of our own gateway upload paths — never an
// arbitrary external URL a client could point at anything.
function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((a, i) => {
    if (!a || typeof a !== 'object') throw new HttpError(400, `attachments[${i}] must be an object.`);
    if (typeof a.url !== 'string' || !a.url.startsWith('/api/uploads/')) {
      throw new HttpError(400, `attachments[${i}].url must be an /api/uploads/ path.`);
    }
    if (typeof a.type !== 'string' || typeof a.name !== 'string') {
      throw new HttpError(400, `attachments[${i}] must have string type and name.`);
    }
    const size = Number(a.size);
    return {
      url: a.url,
      type: a.type,
      name: a.name.slice(0, 255),
      size: Number.isFinite(size) && size >= 0 ? size : 0,
    };
  });
}

// Maps a MIME type to the Message.message_type bucket used for rendering.
function attachmentKind(mime) {
  if (typeof mime === 'string' && mime.startsWith('image/')) return 'image';
  if (typeof mime === 'string' && mime.startsWith('video/')) return 'video';
  return 'file';
}

// GET /api/conversations/:id/messages?limit=30&before=<ISO date>
// Thread view: newest first, paged.
const listMessages = asyncHandler(async (req, res) => {
  const { id: conversationId } = req.params;
  if (!mongoose.isValidObjectId(conversationId)) throw new HttpError(400, 'Invalid conversation id.');

  await assertParticipant(conversationId, req.userId);

  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const before = req.query.before ? new Date(req.query.before) : null;

  // deleted_at must be part of the filter: deleteMessage only soft-deletes, so without this a
  // deleted message reappears on the next page load even though every connected client was told
  // to drop it via the message:deleted socket event.
  const filter = { conversation_id: conversationId, deleted_at: null };
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
  if (reaction.length > MAX_REACTION_LENGTH) {
    throw new HttpError(400, `reaction must be at most ${MAX_REACTION_LENGTH} characters.`);
  }

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
