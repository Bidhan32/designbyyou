const express = require('express');
const router = express.Router();
const designerCtrl = require('../controllers/designerController');
const pitchCtrl = require('../controllers/designerPitchController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { uploadDesign, uploadPreview } = require('../middlewares/upload');



// ==========================================
// UNPROTECTED / PUBLIC DISCOVERY ROUTES
// ==========================================
// Anyone can view a public profile link without authentication
router.get('/profiles/:userId', designerCtrl.getPublicProfile);


// ==========================================
// GLOBAL SECURITY GUARDRAILS (Protected Routes)
// ==========================================
router.use(protect);
router.use(authorize('designer'));


// ==========================================
// IDENTITY & DASHBOARD MODULES
// ==========================================
router.get('/me', designerCtrl.getMe);
router.get('/dashboard', designerCtrl.getDashboard);
router.get('/notifications', designerCtrl.getNotifications);


// ==========================================
// PROFILE MANAGEMENT
// ==========================================
router.patch(
    '/update-profile', 
    uploadPreview.single('profileImage'), 
    designerCtrl.updateProfile
);


// ==========================================
// INVENTORY & MARKETPLACE LISTINGS
// ==========================================
router.get('/my-inventory', designerCtrl.getMyInventory);
router.post('/marketplace/upload', 
    uploadDesign.single('preview'), // Tells Multer to only expect one file named 'display_image'
    designerCtrl.uploadShowcaseDesign // Or whatever you named the updated controller function
);

router.put('/ecommerce/cart/:id', protect, designerCtrl.updateCartItemQuantity);

// ==========================================
// JOB PITCHES / CUSTOM APPLICATIONS
// ==========================================
router.route('/pitches')
    .get(pitchCtrl.getMyPitches)
    .post(pitchCtrl.submitPitch);


// ==========================================
// REPUTATION & FINANCE
// ==========================================
router.get('/reviews', designerCtrl.getMyReviews);
router.post('/withdraw', designerCtrl.requestWithdrawal);
router.get('/wallet-history', designerCtrl.getWalletHistory);






module.exports = router;

module.exports = router;