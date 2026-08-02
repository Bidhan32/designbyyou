const express = require('express');
const router = express.Router();
const p2pController = require('../controllers/p2pBookingController');
const { protect } = require('../middlewares/authMiddleware');

// ==========================================
// 1. STATIC ROUTES (Must go first!)
// ==========================================

// Get all bookings for the active user
router.get('/pipeline', protect, p2pController.getUnifiedPeerPipeline);

// Initialize a new P2P Escrow contract & Stripe Intent
router.post('/create', protect, p2pController.createP2PBooking);

// Verify escrow payment (Manual bypass/webhook fallback)
router.post('/verify-escrow', p2pController.verifyEscrowPayment);


// ==========================================
// 2. DYNAMIC ROUTES (Must go at the bottom!)
// ==========================================

// Remove your old /:id/submit route and add these three in your dynamic routes section:
router.post('/:id/submit-prototype', protect, p2pController.submitPrototype);
router.post('/:id/approve-prototype', protect, p2pController.approvePrototype);

// Milestone 2: Final Assets
router.post('/:id/submit-final', protect, p2pController.submitFinalDeliverables);

// Revisions & Adjustments
router.post('/:id/request-revision', protect, p2pController.requestRevision);

// Payout & Completion
router.post('/:id/release', protect, p2pController.releaseP2PPayout);


// Contract Management
router.post('/:id/cancel', protect, p2pController.requestCancellation);
router.post('/:id/accept', protect, p2pController.acceptProject);
router.post('/:id/reject', protect, p2pController.rejectProject);

module.exports = router;