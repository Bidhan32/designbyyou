const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { uploadPreview } = require('../middlewares/upload');
const { protect } = require('../middlewares/authMiddleware');

// Registration & Verification
router.post('/register', uploadPreview.single('profileImage'), authController.register);
router.post('/verify-otp', authController.verifyEmail);
// Login
router.post('/login', authController.login);

// Password Management
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Session Recovery
router.get('/me', protect, authController.getMe);

// System Setup Route
router.post('/setup-admin-fix', authController.setupSuperadmin);

module.exports = router;