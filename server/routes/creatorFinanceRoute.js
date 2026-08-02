const express = require('express');
const router = express.Router();
const creatorFinanceController = require('../controllers/creators/creatorFinanceController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(authorize('creator')); 

// Financial metrics endpoint
router.get('/summary', creatorFinanceController.getCreatorWalletSummary);

// Transaction logs endpoint
router.get('/ledger', creatorFinanceController.getOutboundLedger);

module.exports = router;