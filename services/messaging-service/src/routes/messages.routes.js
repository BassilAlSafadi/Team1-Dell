const { Router } = require('express');
const { markRead, addReaction, deleteMessage } = require('../controllers/messages.controller');

const router = Router();

router.post('/:id/read', markRead);
router.post('/:id/reactions', addReaction);
router.delete('/:id', deleteMessage);

module.exports = router;
