const express = require('express');
const conversationController = require('../controllers/conversationController');

const router = express.Router();

// Conversation routes
router.post('/start', conversationController.startConversation);
router.get('/', conversationController.getUserConversations);
router.get('/:conversationId', conversationController.getConversation);
router.post('/:conversationId/message', conversationController.processMessage);
router.put('/:conversationId/end', conversationController.endConversation);
router.get('/analytics/overview', conversationController.getConversationAnalytics);

module.exports = router; 