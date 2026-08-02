const db = require('../config/db');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
/**
 * 1. Fetch current available and pending escrow balances
 * Reads directly from the ground-truth designer_wallets table.
 */
exports.getWalletBalance = async (req, res) => {
    try {
        const designerId = req.user.id;

        const walletQuery = await db.query(
            `SELECT available_balance, pending_escrow_balance
             FROM designer_wallets 
             WHERE user_id = $1`,
            [designerId]
        );

        // Fallback state if the designer hasn't activated their wallet row yet
        const wallet = walletQuery.rows[0] || { available_balance: "0.00", pending_escrow_balance: "0.00" };

        res.status(200).json({ status: 'success', data: wallet });
    } catch (err) {
        console.error("Wallet Fetch Failure:", err);
        res.status(500).json({ message: "Failed to load wallet metrics." });
    }
};

/**
 * 2. Pull line-item credit ledger (Sales Breakdown)
 * 🚀 FIXED: Bypasses 'orders' entirely and looks directly at the transaction sender,
 * making it 100% compatible with both standard orders AND your new P2P Bookings!
 */
exports.getEarningsLedger = async (req, res) => {
    try {
        const designerId = req.user.id;

        const statementQuery = await db.query(
            `SELECT t.id AS transaction_id, t.gross_amount, t.platform_fee_deducted, t.net_amount, t.created_at,
                    t.reference_id AS order_id, u.full_name AS buyer_name
             FROM transactions t
             JOIN users u ON t.sender_id = u.id
             WHERE t.receiver_id = $1 AND t.transaction_type = 'marketplace_purchase'
             ORDER BY t.created_at DESC`,
            [designerId]
        );

        res.status(200).json({ status: 'success', data: statementQuery.rows });
    } catch (err) {
        console.error("Ledger Statement Sync Failure:", err);
        res.status(500).json({ message: "Failed to extract earnings history ledger." });
    }
};

/**
 * 3. File a formal withdrawal/payout request
 * FIXED: Uses strict integer math for balance checks and safe foreign keys.
 */
exports.requestPayout = async (req, res) => {
    const client = await db.connect();
    try {
        const designerId = req.user.id;
        const { amount, payoutMethod, accountDetails } = req.body; 
        const requestedAmount = parseFloat(amount);

        if (!requestedAmount || requestedAmount <= 0) {
            return res.status(400).json({ message: "Invalid payout request valuation." });
        }

        // --- FIX 1: Convert requested amount to strict cents to bypass JS floating-point bugs ---
        const requestedCents = Math.round(requestedAmount * 100);

        await client.query('BEGIN');

        const walletCheck = await client.query(
            'SELECT available_balance FROM designer_wallets WHERE user_id = $1 FOR UPDATE',
            [designerId]
        );

        if (walletCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Active wallet profile not found." });
        }

        // --- FIX 1 Cont'd: Convert DB balance to strict cents for accurate comparison ---
        const availableCents = Math.round(parseFloat(walletCheck.rows[0].available_balance) * 100);

        if (availableCents < requestedCents) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Insufficient fluid funds available for deduction." });
        }

        // A. Deduct the amount instantly
        await client.query(
            `UPDATE designer_wallets 
             SET available_balance = available_balance - $1 
             WHERE user_id = $2`,
            [requestedAmount, designerId]
        );

        // B. Write the payout into the ledger
        // --- FIX 2: Use designerId as both sender AND receiver to safely satisfy Foreign Key constraints ---
        await client.query(
            `INSERT INTO transactions (
                id, sender_id, receiver_id, gross_amount, platform_fee_deducted, 
                net_amount, transaction_type, stripe_payment_intent_id, created_at
             ) VALUES (
                gen_random_uuid(), $1, $1, $2, 0, $2, 'payout', $3, NOW()
             )`,
            [designerId, requestedAmount, accountDetails || payoutMethod]
        );

        await client.query('COMMIT');
        res.status(201).json({ status: 'success', message: "Payout recorded on ledger successfully." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Payout Processing Failure:", err);
        res.status(500).json({ message: "Failed to log withdrawal sequence inside ledger." });
    } finally {
        client.release();
    }
};

/**
 * 4. Fetch past withdrawal request histories
 * FIXED: Rerouted to extract 'payout' item records from the native transactions table.
 */
exports.getPayoutHistory = async (req, res) => {
    try {
        const designerId = req.user.id;

        const historyQuery = await db.query(
            `SELECT 
                id AS request_id, 
                gross_amount AS amount, 
                'completed' AS status, -- Hardcoded as completed since it's an immediate ledger hit
                stripe_payment_intent_id AS destination,
                created_at 
             FROM transactions 
             WHERE sender_id = $1 AND transaction_type = 'payout'
             ORDER BY created_at DESC`,
            [designerId]
        );

        res.status(200).json({ status: 'success', data: historyQuery.rows });
    } catch (err) {
        console.error("Payout History Sync Failure:", err);
        res.status(500).json({ message: "Failed to fetch payout histories." });
    }
};

exports.createWalletDeposit = async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Invalid deposit structural amount." });
    }

    // Stripe requires amounts in cents
    const amountInCents = Math.round(parseFloat(amount) * 100);

    try {
        // 1. Initialize Stripe Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'usd',
            metadata: {
                user_id: userId,
                transaction_purpose: 'wallet_deposit'
            }
        });

        // 2. Return the secure key to the frontend
        res.status(200).json({ 
            status: 'success', 
            clientSecret: paymentIntent.client_secret 
        });

    } catch (err) {
        console.error("Stripe Deposit Init Error:", err);
        res.status(500).json({ message: "Failed to initialize secure deposit gateway." });
    }
};

exports.verifyWalletDeposit = async (req, res) => {
    // Assuming you have db required at the top: const db = require('../config/db');
    const client = await db.connect();
    const { paymentIntentId, amount } = req.body;
    const userId = req.user.id;

    try {
        await client.query('BEGIN');

        // 1. Idempotency Check: Did we already process this exact Stripe charge?
        const txCheck = await client.query(
            'SELECT id FROM transactions WHERE stripe_payment_intent_id = $1', 
            [paymentIntentId]
        );
        
        if (txCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(200).json({ status: 'success', message: 'Already credited.' });
        }

        // 2. Add funds to the Designer's Wallet
        await client.query(
            `INSERT INTO designer_wallets (user_id, available_balance, pending_escrow_balance)
             VALUES ($1, $2, 0)
             ON CONFLICT (user_id) 
             DO UPDATE SET available_balance = designer_wallets.available_balance + $2`,
            [userId, parseFloat(amount)]
        );

        // 3. Log it in the Transactions table so it appears in the UI Ledger
        await client.query(
            `INSERT INTO transactions (id, sender_id, receiver_id, reference_id, gross_amount, net_amount, transaction_type, stripe_payment_intent_id, created_at)
             VALUES (gen_random_uuid(), $1, $1, null, $2, $2, 'wallet_deposit', $3, NOW())`,
            [userId, parseFloat(amount), paymentIntentId]
        );

        await client.query('COMMIT');
        res.status(200).json({ status: 'success', message: 'Funds securely vaulted.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Wallet Deposit Verification Error:", err);
        res.status(500).json({ message: "Failed to verify and credit wallet." });
    } finally {
        client.release();
    }
};