const { Schema, model } = require('mongoose');

// Kept out of the conversation document so one participant muting or archiving
// does not rewrite a document the other participant reads.
const conversationParticipantSchema = new Schema(
  {
    conversation_id: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    user_id: { type: String, required: true }, // EXT -> Auth Service
    joined_at: { type: Date, default: Date.now },
    last_read_message_id: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    last_read_at: { type: Date, default: null },
    muted: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
  },
  { collection: 'conversation_participants' }
);

conversationParticipantSchema.index({ conversation_id: 1, user_id: 1 }, { unique: true });
conversationParticipantSchema.index({ user_id: 1, archived: 1 });

module.exports = model('ConversationParticipant', conversationParticipantSchema);
