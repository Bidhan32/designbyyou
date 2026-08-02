const db = require('../../config/db');

/**
 * Fetch unified financial summary for creators
 */
exports.getCreatorWalletSummary = async (req, res) => {
    try {
        const creatorId = req.user.id;

        // 1. Calculate active funds locked in escrow
        const escrowQuery = await db.query(
            `SELECT COALESCE(SUM(agreed_price), 0) AS locked_escrow 
             FROM bookings 
             WHERE creator_id = $1 AND escrow_locked = true`,
            [creatorId]
        );

        // 2. Calculate total lifespan spend (P2P completed contracts + Store orders)
        const completedContractsQuery = await db.query(
            `SELECT COALESCE(SUM(gross_amount), 0) AS total_p2p_spent 
             FROM transactions 
             WHERE sender_id = $1 AND transaction_type = 'marketplace_purchase'`,
            [creatorId]
        );

        const storeOrdersQuery = await db.query(
            `SELECT COALESCE(SUM(total_amount), 0) AS total_store_spent 
             FROM orders 
             WHERE buyer_id = $1 AND payment_status = 'completed'`,
            [creatorId]
        );

        const lockedEscrow = escrowQuery.rows[0].locked_escrow;
        const totalSpent = parseFloat(completedContractsQuery.rows[0].total_p2p_spent) + 
                           parseFloat(storeOrdersQuery.rows[0].total_store_spent);

        res.status(200).json({
            status: 'success',
            data: {
                locked_escrow_balance: lockedEscrow,
                total_lifespan_spend: totalSpent.toFixed(2)
            }
        });
    } catch (err) {
        console.error("Creator Financial Fetch Error:", err);
        res.status(500).json({ message: "Failed to evaluate creator metric thresholds." });
    }
};

/**
 * Pull comprehensive outbound transaction logs for creators
 */
exports.getOutboundLedger = async (req, res) => {
    try {
        const creatorId = req.user.id;

        // Pulls all transactions initiated by the creator, joining the recipient user profile name
        const ledgerQuery = await db.query(
            `SELECT t.id AS transaction_id, t.gross_amount, t.transaction_type, t.created_at,
                    t.stripe_payment_intent_id, u.full_name AS recipient_name
             FROM transactions t
             LEFT JOIN users u ON t.receiver_id = u.id
             WHERE t.sender_id = $1
             ORDER BY t.created_at DESC`,
            [creatorId]
        );

        res.status(200).json({ status: 'success', data: ledgerQuery.rows });
    } catch (err) {
        console.error("Outbound Ledger Error:", err);
        res.status(500).json({ message: "Failed to load outbound transactional records." });
    }
};