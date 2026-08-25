const { Router } = require('express');
const {
  createConversation,
  listConversations,
  getConversation,
  updateMyParticipantState,
} = require('../controllers/conversations.controller');
const {
  sendMessage,
  listMessages,
} = require('../controllers/messages.controller');

const router = Router();

router.post('/', createConversation);
router.get('/', listConversations);
router.get('/:id', getConversation);
router.patch('/:id/participant', updateMyParticipantState);

router.post('/:id/messages', sendMessage);
router.get('/:id/messages', listMessages);

module.exports = router;
