const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const userCtrl = require('../controllers/userController');

// 🚀 THE FIX: Destructure the specific upload instance (uploadDesign)
const { uploadDesign } = require('../middlewares/upload'); 

// 1. SPECIFIC ROUTES GO FIRST
router.get('/', userCtrl.getAllUsers);

// 🚀 THE FIX: Use uploadDesign.single instead of upload.single
router.put('/profile', protect, uploadDesign.single('profile_image'), userCtrl.updateProfile);

router.put('/security', protect, userCtrl.updateSecurity);

// 2. DYNAMIC ID ROUTE GOES ABSOLUTELY LAST
router.get('/:id', userCtrl.getUserProfileById);

module.exports = router;