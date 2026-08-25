const { Schema, model } = require('mongoose');

// Bounded (2 for a direct chat), so embedding here is correct per the messaging
// EERD — unlike messages, which are referenced, never embedded.
const participantSchema = new Schema(
  {
    user_id: { type: String, required: true }, // EXT -> Auth Service USER.user_id
    role: { type: String, enum: ['vendor', 'corporate'], required: true },
  },
  { _id: false }
);

const lastMessageSchema = new Schema(
  {
    message_id: { type: Schema.Types.ObjectId, ref: 'Message' },
    sender_id: { type: String }, // EXT -> Auth Service
    content_preview: { type: String },
    sent_at: { type: Date },
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    participants: {
      type: [participantSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: 'A conversation must have exactly 2 participants.',
      },
      required: true,
    },
    listing_id: { type: String, default: null }, // EXT -> Marketplace Service LISTING.listing_id
    last_message: { type: lastMessageSchema, default: null },
  },
  {
    collection: 'conversations',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

conversationSchema.index({ 'participants.user_id': 1, updated_at: -1 });
conversationSchema.index({ listing_id: 1 }, { sparse: true });

module.exports = model('Conversation', conversationSchema);
