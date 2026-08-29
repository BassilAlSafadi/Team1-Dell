const { Schema, model } = require('mongoose');

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true }, // object-store key, never the file itself
    type: { type: String, required: true },
    name: { type: String },
    size: { type: Number },
  },
  { _id: false }
);

const reactionSchema = new Schema(
  {
    user_id: { type: String, required: true }, // EXT -> Auth Service
    reaction: { type: String, required: true }, // emoji shortcode
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Stored in its own collection, never embedded in the conversation: a single
// conversation may hold tens of thousands of messages and would breach the
// 16 MB BSON document limit.
const messageSchema = new Schema(
  {
    conversation_id: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender_id: { type: String, required: true }, // EXT -> Auth Service
    content: { type: String, required: true },
    message_type: { type: String, enum: ['text', 'image', 'video', 'file', 'system'], default: 'text' },
    attachments: { type: [attachmentSchema], default: [] },
    reply_to_message_id: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: { type: [reactionSchema], default: [] },
    deleted_at: { type: Date, default: null }, // soft delete keeps read positions/threads intact
  },
  {
    collection: 'messages',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

messageSchema.index({ conversation_id: 1, created_at: -1 });
messageSchema.index({ sender_id: 1, created_at: -1 });

module.exports = model('Message', messageSchema);
