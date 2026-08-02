// services/designerFinanceService.js
const db = require('../config/db');

/**
 * PROCESS DIRECT MARKETPLACE ORDER EARNINGS
 * Routes funds to a designer's wallet immediately when a pre-made item is purchased.
 */
exports.processMarketplaceSaleEarnings = async (orderId) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch items in the order along with who designed them
        const orderItemsQuery = await client.query(
            `SELECT oi.id, oi.purchased_price, d.owner_id AS designer_id, d.title
             FROM order_items oi
             JOIN designs d ON oi.design_id = d.id
             WHERE oi.order_id = $1`,
            [orderId]
        );

        for (const item of orderItemsQuery.rows) {
            const { designer_id, purchased_price, title } = item;

            // 2. Pull designer's profile to check their platform commission_rate
            const profileQuery = await client.query(
                `SELECT commission_rate FROM designer_profiles WHERE user_id = $1`,
                [designer_id]
            );
            
            // Fallback to a standard 10% platform cut if commission rate isn't set explicitly
            const platformRate = profileQuery.rows[0]?.commission_rate || 0.10;
            
            // Calculate financial breakdown
            const grossAmount = parseFloat(purchased_price);
            const platformFee = grossAmount * parseFloat(platformRate);
            const netAmount = grossAmount - platformFee;

            // 3. Credit the designer's available wallet balance immediately for storefront sales
            await client.query(
                `UPDATE designer_wallets 
                 SET available_balance = available_balance + $1,
                     updated_at = NOW()
                 WHERE user_id = $2`,
                [netAmount, designer_id]
            );

            // 4. Log the audit record into the main transactions ledger
            await client.query(
                `INSERT INTO transactions (
                    id, sender_id, receiver_id, reference_id, 
                    gross_amount, platform_fee_deducted, net_amount, 
                    transaction_type, created_at
                ) VALUES (
                    gen_random_uuid(), 
                    (SELECT buyer_id FROM orders WHERE id = $1), -- Sender is the buyer
                    $2, -- Receiver is the designer
                    $3, -- Reference ID pointing to the order item
                    $4, $5, $6, 
                    'marketplace_sale', 
                    NOW()
                )`,
                [orderId, designer_id, item.id, grossAmount, platformFee, netAmount]
            );

            // 5. Fire a notification to the designer about the sale
            await client.query(
                `INSERT INTO notifications (id, user_id, title, message, is_read, priority, created_at)
                 VALUES (gen_random_uuid(), $1, 'Item Sold! 💰', $2, false, 1, NOW())`,
                [designer_id, `Your design "${title}" was purchased. Your wallet has been credited $${netAmount.toFixed(2)}.`]
            );
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Marketplace Financial Sync Engine Failure:", err);
        throw err;
    } finally {
        client.release();
    }
};