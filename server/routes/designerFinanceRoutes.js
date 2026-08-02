const express = require('express');
const router = express.Router();
const designerFinanceController = require('../controllers/designerFinanceController');

// Update this line to use your exact middleware export name: authorize
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(authorize('designer')); // Changed from restrictTo to authorize

// 1. Core Balance Tracking
router.get('/wallet', designerFinanceController.getWalletBalance);

// 2. Marketplace Earnings / Credit History Ledger 
router.get('/ledger', designerFinanceController.getEarningsLedger);

// 3. Withdrawal/Payout Orchestration
router.route('/payouts')
    .get(designerFinanceController.getPayoutHistory)   
    .post(designerFinanceController.requestPayout);    

    router.post('/wallet/deposit', protect, designerFinanceController.createWalletDeposit);

    router.post('/wallet/verify-deposit', protect, designerFinanceController.verifyWalletDeposit);

module.exports = router;