const express = require('express');
const router = express.Router();
const chatCtrl = require('../controllers/chatController');
const { protect } = require('../middlewares/authMiddleware');
const { uploadPreview } = require('../middlewares/upload'); // Use optimized preview storage

// Apply explicit protection guardrails to all communications paths
router.use(protect);

// Interaction Retrieval
router.get('/rooms', chatCtrl.getMyRooms);
router.get('/history/:roomId', chatCtrl.getChatHistory);

// Handle optional file attachments in chat (e.g., screenshots/samples)
router.post('/send', uploadPreview.single('attachment'), chatCtrl.sendMessage);

// Synchronization Initializer
router.post('/initialize', chatCtrl.createOrGetRoom);

module.exports = router;