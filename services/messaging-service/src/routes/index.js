const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const conversationsRoutes = require('./conversations.routes');
const messagesRoutes = require('./messages.routes');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.use('/conversations', requireAuth, conversationsRoutes);
router.use('/messages', requireAuth, messagesRoutes);

module.exports = router;
