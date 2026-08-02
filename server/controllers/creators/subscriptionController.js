const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = require('../../config/db');

/**
 * ============================================================================
 * 1. GENERATE CHECKOUT SESSION (Called when user clicks "Upgrade" on Paywall)
 * ============================================================================
 */
exports.createCheckoutSession = async (req, res) => {
    try {
        const { priceId } = req.body;
        const userId = req.user.id || req.user._id;

        // 1. Fetch user data to pre-fill Stripe checkout
        const userQuery = await db.query('SELECT email, full_name FROM users WHERE id = $1', [userId]);
        if (userQuery.rows.length === 0) return res.status(404).json({ message: "User not found." });
        
        const user = userQuery.rows[0];

        // 2. Map Price IDs to internal tier names for the database
        let tierName = 'monthly'; // Defaults to monthly
        
        // 🚀 CRITICAL FIX: PASTE YOUR REAL STRIPE PRICE IDs HERE 
        // Replace 'price_1YOUR_60_DOLLAR_ID_HERE' with your real Quarterly API ID
        if (priceId === 'price_1YOUR_60_DOLLAR_ID_HERE') tierName = 'quarterly';
        
        // Replace 'price_1YOUR_99_DOLLAR_ID_HERE' with your real Yearly API ID
        if (priceId === 'price_1YOUR_99_DOLLAR_ID_HERE') tierName = 'yearly';

        // 🚀 Safely define the base URL with a fallback
        const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';

        // 3. Create the secure Stripe Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            customer_email: user.email,
            client_reference_id: String(userId),
            metadata: {
                user_id: String(userId),
                subscription_tier: tierName
            },
            line_items: [
                {
                    price: priceId, // 🚨 Stripe will crash if this is a dummy string
                    quantity: 1,
                },
            ],
            success_url: `${baseUrl}/creator/wallet?subscription=success`,
            cancel_url: `${baseUrl}/creator/wallet?subscription=cancelled`,
        });

        // 4. Return the hosted URL to the frontend
        res.status(200).json({ url: session.url });

    } catch (error) {
        console.error("Stripe Checkout Generation Error:", error);
        res.status(500).json({ message: "Failed to initialize secure checkout. Please try again." });
    }
};

/**
 * ============================================================================
 * 2. STRIPE WEBHOOK (Listens for successful payments behind the scenes)
 * ============================================================================
 */
exports.handleStripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // 🚨 CRITICAL: req.body MUST be raw text/buffer here, not JSON!
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Webhook signature verification failed:`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            
            // Triggered the very first time they successfully pay on the checkout page
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.client_reference_id;
                const tier = session.metadata.subscription_tier;

                if (userId && tier) {
                    // Activate the subscription for 1 month, 3 months, or 1 year. 
                    let monthsToAdd = 1;
                    if (tier === 'quarterly') monthsToAdd = 3;
                    if (tier === 'yearly') monthsToAdd = 12;

                    await db.query(
                        `UPDATE users 
                         SET subscription_tier = $1, 
                             subscription_active_until = NOW() + INTERVAL '${monthsToAdd} months'
                         WHERE id = $2`,
                        [tier, userId]
                    );
                    console.log(`✅ Subscription Unlocked: User ${userId} upgraded to ${tier}`);
                }
                break;
            }

            // Triggered every time their card is automatically charged for renewal
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                    const endDate = new Date(subscription.current_period_end * 1000).toISOString();
                    console.log(`✅ Subscription Renewed: Active until ${endDate}`);
                }
                break;
            }

            // Triggered if they cancel or their card fails too many times
            case 'customer.subscription.deleted': {
                // Downgrade logic here
                console.log(`❌ Subscription Cancelled/Expired.`);
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error("Webhook processing error:", err);
        res.status(500).json({ message: "Internal webhook processing failed." });
    }
};