const express = require('express');
const router = express.Router();
const multer = require('multer'); // 🚀 ADDED: Import Multer
const designerProfileCtrl = require('../controllers/designerProfileController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { uploadPreview } = require('../middlewares/upload'); // Pipes new avatars to Cloudinary

// 🚀 ADDED: Set up memory storage specifically for the AI Forge
// We need the image in memory (as a buffer) so we can convert it to Base64 for Replicate
const memoryUpload = multer({ storage: multer.memoryStorage() });

// Global Route Guardrails - Must be authenticated and verified as a designer
router.use(protect);
router.use(authorize('designer'));

// Mapped Processing Paths
router.get('/my-studio', designerProfileCtrl.getMyProfile);
router.get('/dashboard/analytics', designerProfileCtrl.getDashboardMetrics);
router.put('/update-studio', uploadPreview.single('avatar'), designerProfileCtrl.updateProfile);

// 🚀 FIXED: Changed profileController to designerProfileCtrl and used memoryUpload
router.post('/avatar/generate', memoryUpload.single('image'), designerProfileCtrl.generateProAvatar);

module.exports = router;