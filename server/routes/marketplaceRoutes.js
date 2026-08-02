const express = require('express');
const router = express.Router();
const marketCtrl = require('../controllers/marketplaceController');
const { protect } = require('../middlewares/authMiddleware');

// ==========================================
// PUBLIC ENDPOINTS (No Auth Required)
// ==========================================
router.get('/', marketCtrl.getMarketplace);
router.get('/product/:slug', marketCtrl.getDesignDetails);

// ==========================================
// PROTECTED TRANSACTIONS (Requires Login)
// ==========================================
router.post('/purchase', protect, marketCtrl.purchaseDesign);
router.get('/download/:designId', protect, marketCtrl.getDownloadedAsset);

module.exports = router;