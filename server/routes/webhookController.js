const express = require('express');
const router = express.Router();
const db = require('../config/db');
const p2pController = require('../controllers/p2pBookingController');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// CRITICAL: Raw buffer interpretation applied directly to the endpoint handler
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`❌ Webhook Signature Verification Failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const client = await db.connect();
        
        try {
            await client.query('BEGIN');
            
            const result = await p2pController.processEscrowLockInternal(paymentIntent, client);
            
            if (!result.success) {
                await client.query('ROLLBACK');
                console.error("⚠️ Webhook processing stalled:", result.reason);
                return res.status(422).json({ error: result.reason });
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("💥 Webhook database transaction crash:", error);
            return res.status(500).send("Internal Ledger Error");
        } finally {
            client.release();
        }
    }

    res.json({ received: true });
});

module.exports = router;