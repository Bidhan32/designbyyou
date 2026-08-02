const express = require('express');
const router = express.Router();

// Ensure this path matches exactly where your controller lives
const subController = require('../controllers/creators/subscriptionController');
const { protect } = require('../middlewares/authMiddleware');

// 1. The frontend route (Standard JSON)
// 🚀 FIXED: Renamed to match the React frontend's API call exactly
router.post('/create-checkout-session', protect, express.json(), subController.createCheckoutSession);

// 2. The Webhook route (MUST BE RAW!)
// Notice we use express.raw() instead of express.json() here.
router.post('/webhook', express.raw({ type: 'application/json' }), subController.handleStripeWebhook);

module.exports = router;