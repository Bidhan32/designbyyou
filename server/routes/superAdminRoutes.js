const express = require('express');
const router = express.Router();
const superCtrl = require('../controllers/superAdminController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// STICKY SECURITY: Only Superadmins allowed here
router.use(protect);
router.use(authorize('superadmin'));

// --- User & Designer Management ---
router.post('/manage/admins', superCtrl.createAdmin);
router.patch('/manage/users/:userId/status', superCtrl.manageUserStatus);
// ADDED: Route to see the queue of designers waiting for approval
router.get('/manage/pending-designers', superCtrl.getPendingDesigners);

// --- Money & Business Logic ---
router.patch('/business/commission', superCtrl.updateGlobalCommission);
router.get('/business/ledger', superCtrl.getFinancialOverview);
// ADDED: Route to see designer balances
router.get('/business/payouts', superCtrl.getPayoutDashboard);

// --- Platform Oversight & Moderation ---
router.get('/system/stats', superCtrl.getGlobalStats);
// ADDED: Route to unpublish or delete designs
router.patch('/system/moderate/:designId', superCtrl.moderateDesign);

module.exports = router;