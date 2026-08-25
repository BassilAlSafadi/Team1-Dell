const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const ConversationParticipant = require('../models/ConversationParticipant');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { assertParticipant } = require('../services/participation');

// POST /api/conversations
// Starts a direct conversation with another user, or returns the existing one for
// the same pair (+ listing) so "Message Seller" clicked twice doesn't fork threads.
const createConversation = asyncHandler(async (req, res) => {
  const { participantUserId, participantRole, otherParticipantRole, listingId } = req.body;

  if (!participantUserId || typeof participantUserId !== 'string') {
    throw new HttpError(400, 'participantUserId is required.');
  }
  if (participantUserId === req.userId) {
    throw new HttpError(400, 'Cannot start a conversation with yourself.');
  }

  const myRole = participantRole || 'vendor';
  const theirRole = otherParticipantRole || 'corporate';
  const normalizedListingId = listingId || null;

  const existing = await Conversation.findOne({
    listing_id: normalizedListingId,
    'participants.user_id': { $all: [req.userId, participantUserId] },
  });
  if (existing) {
    return res.status(200).json(existing);
  }

  const conversation = await Conversation.create({
    participants: [
      { user_id: req.userId, role: myRole },
      { user_id: participantUserId, role: theirRole },
    ],
    listing_id: normalizedListingId,
  });

  await ConversationParticipant.insertMany([
    { conversation_id: conversation._id, user_id: req.userId },
    { conversation_id: conversation._id, user_id: participantUserId },
  ]);

  return res.status(201).json(conversation);
});

// GET /api/conversations?archived=false&limit=20&before=<ISO date>
// Inbox: every conversation I'm in, newest activity first (paged by updated_at).
const listConversations = asyncHandler(async (req, res) => {
  const archived = req.query.archived === 'true';
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const before = req.query.before ? new Date(req.query.before) : null;

  const myParticipantRows = await ConversationParticipant.find({
    user_id: req.userId,
    archived,
  }).select('conversation_id');
  const conversationIds = myParticipantRows.map((p) => p.conversation_id);

  const filter = { _id: { $in: conversationIds } };
  if (before && !Number.isNaN(before.getTime())) {
    filter.updated_at = { $lt: before };
  }

  const conversations = await Conversation.find(filter).sort({ updated_at: -1 }).limit(limit);

  return res.json(conversations);
});

// GET /api/conversations/:id
const getConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid conversation id.');

  const participant = await assertParticipant(id, req.userId);
  const conversation = await Conversation.findById(id);
  if (!conversation) throw new HttpError(404, 'Conversation not found.');

  return res.json({ conversation, myParticipantState: participant });
});

// PATCH /api/conversations/:id/participant  { muted?, archived? }
// Per-participant state, so this only ever touches the caller's own row.
const updateMyParticipantState = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid conversation id.');

  const { muted, archived } = req.body;
  const update = {};
  if (typeof muted === 'boolean') update.muted = muted;
  if (typeof archived === 'boolean') update.archived = archived;
  if (Object.keys(update).length === 0) {
    throw new HttpError(400, 'Provide at least one of: muted, archived.');
  }

  const participant = await ConversationParticipant.findOneAndUpdate(
    { conversation_id: id, user_id: req.userId },
    { $set: update },
    { new: true }
  );
  if (!participant) throw new HttpError(403, 'Not a participant of this conversation.');

  return res.json(participant);
});

module.exports = {
  createConversation,
  listConversations,
  getConversation,
  updateMyParticipantState,
};
