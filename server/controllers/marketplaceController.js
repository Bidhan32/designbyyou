const db = require('../config/db');

// @desc    Get All Published Designs (With Optimized Native Search & Filter)
// exports.getMarketplace = async (req, res) => {
//     try {
//         const { style, minPrice, maxPrice, search } = req.query;
        
//         let query = `
//             SELECT 
//                 d.id, d.title, d.slug, d.sku, d.base_price, d.discount_price,
//                 d.watermarked_preview_url, d.style_category, d.tags, d.product_type,
//                 u.full_name as designer_name, u.profile_image_url as designer_avatar
//             FROM designs d
//             JOIN users u ON d.owner_id = u.id
//             WHERE d.is_published = true AND d.is_public = true
//         `;
        
//         const params = [];

//         if (style) {
//             params.push(style);
//             query += ` AND d.style_category ILIKE $${params.length}`;
//         }
//         if (minPrice) {
//             params.push(parseFloat(minPrice));
//             query += ` AND COALESCE(d.discount_price, d.base_price) >= $${params.length}`;
//         }
//         if (maxPrice) {
//             params.push(parseFloat(maxPrice));
//             query += ` AND COALESCE(d.discount_price, d.base_price) <= $${params.length}`;
//         }
//         if (search) {
//             params.push(`%${search}%`);
//             const searchIndex = params.length;
            
//             params.push([search.toLowerCase()]);
//             const arrayIndex = params.length;

//             // PERFORMANCE FIX: Swapped out slow text casting (d.tags::text) for optimized native array indexing ($5 && d.tags)
//             query += ` AND (d.title ILIKE $${searchIndex} OR d.description ILIKE $${searchIndex} OR d.tags && $${arrayIndex})`;
//         }

//         query += ` ORDER BY d.created_at DESC`;

//         const result = await db.query(query, params);
//         res.status(200).json({ status: 'success', results: result.rows.length, data: result.rows });
//     } catch (error) {
//         console.error("Database query error:", error);
//         res.status(500).json({ message: "Marketplace is currently unavailable." });
//     }
// };

// @desc    Get All Published Designs (With Optimized Native Search & Filter)
exports.getMarketplace = async (req, res) => {
    try {
        const { style, minPrice, maxPrice, search } = req.query;
        
        let query = `
            SELECT 
                d.id, 
                d.owner_id, -- 🌟 FIXED: Added d.owner_id so the frontend can retrieve the designer's target user ID!
                d.title, 
                d.slug, 
                d.sku, 
                d.base_price, 
                d.discount_price,
                d.watermarked_preview_url, 
                d.style_category, 
                d.tags, 
                d.product_type,
                u.full_name as designer_name, 
                u.profile_image_url as designer_avatar
            FROM designs d
            JOIN users u ON d.owner_id = u.id
            WHERE d.is_published = true AND d.is_public = true
        `;
        
        const params = [];

        if (style) {
            params.push(style);
            query += ` AND d.style_category ILIKE $${params.length}`;
        }
        if (minPrice) {
            params.push(parseFloat(minPrice));
            query += ` AND COALESCE(d.discount_price, d.base_price) >= $${params.length}`;
        }
        if (maxPrice) {
            params.push(parseFloat(maxPrice));
            query += ` AND COALESCE(d.discount_price, d.base_price) <= $${params.length}`;
        }
        if (search) {
            params.push(`%${search}%`);
            const searchIndex = params.length;
            
            params.push([search.toLowerCase()]);
            const arrayIndex = params.length;

            // PERFORMANCE FIX: Swapped out slow text casting (d.tags::text) for optimized native array indexing ($5 && d.tags)
            query += ` AND (d.title ILIKE $${searchIndex} OR d.description ILIKE $${searchIndex} OR d.tags && $${arrayIndex})`;
        }

        query += ` ORDER BY d.created_at DESC`;

        const result = await db.query(query, params);
        res.status(200).json({ status: 'success', results: result.rows.length, data: result.rows });
    } catch (error) {
        console.error("Database query error:", error);
        res.status(500).json({ message: "Marketplace is currently unavailable." });
    }
};

// @desc    Get Single Design Details (Excludes high-res download keys)
exports.getDesignDetails = async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await db.query(`
            SELECT 
                d.id, d.owner_id, d.sku, d.title, d.slug, d.description, 
                d.canvas_state, d.watermarked_preview_url, d.base_price, 
                d.discount_price, d.product_type, d.license_type, d.tags, 
                d.style_category, d.created_at,
                u.full_name as designer_name, u.profile_image_url as designer_avatar
            FROM designs d
            JOIN users u ON d.owner_id = u.id
            WHERE d.slug = $1 AND d.is_published = true AND d.is_public = true
        `, [slug]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Design not found or no longer available." });
        }
        
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error("Error retrieving public product records:", error);
        res.status(500).json({ message: "Error loading product details." });
    }
};

// @desc    Purchase Design Asset & Update Digital Ledgers (Exploit Protected)
exports.purchaseDesign = async (req, res) => {
    const { designId } = req.body;
    const buyerId = req.user.id;
    const buyerRole = req.user.role; // Extract role from auth middleware ('designer' or 'creator')

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch design details and lock the row safely for sharing
        const designRes = await client.query(
            `SELECT id, owner_id, title, base_price, discount_price, high_res_file_url 
             FROM designs WHERE id = $1 AND is_published = true FOR SHARE`,
            [designId]
        );

        if (designRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Asset design context not found." });
        }

        const design = designRes.rows[0];
        if (design.owner_id === buyerId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Self-purchasing assets is restricted." });
        }

        // 2. Check historical asset ownership
        const checkOwnership = await client.query(
            `SELECT id FROM purchased_designs WHERE user_id = $1 AND design_id = $2`,
            [buyerId, designId]
        );
        if (checkOwnership.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "You already own this digital asset library module." });
        }

        const finalPrice = parseFloat(design.discount_price || design.base_price);

        // 3. Dynamic Multi-Tenant Wallet Selector
        // Dynamically determines whether to target creator_wallets or designer_wallets based on user role
        const buyerWalletTable = buyerRole === 'creator' ? 'creator_wallets' : 'designer_wallets';
        
        const buyerWalletRes = await client.query(
            `SELECT available_balance FROM ${buyerWalletTable} WHERE user_id = $1 FOR UPDATE`,
            [buyerId]
        );

        if (buyerWalletRes.rows.length === 0 || parseFloat(buyerWalletRes.rows[0].available_balance) < finalPrice) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Insufficient account credit balance pools." });
        }

        // 4. Fetch designer profile system commission configurations
        const profileRes = await client.query(
            `SELECT commission_rate FROM designer_profiles WHERE user_id = $1`,
            [design.owner_id]
        );
        const commissionRate = profileRes.rows.length > 0 ? parseFloat(profileRes.rows[0].commission_rate) : 0.10; 

        const platformFee = finalPrice * commissionRate;
        const designerPayout = finalPrice - platformFee;

        // 5. Lock the receiving designer's wallet row to protect against multi-purchase concurrency overwrites
        await client.query(
            `SELECT available_balance FROM designer_wallets WHERE user_id = $1 FOR UPDATE`,
            [design.owner_id]
        );

        // 6. Deduct balance pools from buyer
        await client.query(
            `UPDATE ${buyerWalletTable} SET available_balance = available_balance - $1 WHERE user_id = $2`,
            [finalPrice, buyerId]
        );

        // 7. Credit net processing balance pools to designer 
        await client.query(
            `UPDATE designer_wallets SET available_balance = available_balance + $1 WHERE user_id = $2`,
            [designerPayout, design.owner_id]
        );

        // 8. Log financial ledger tracking parameters (Fixed JS UUID crash)
        await client.query(
            `INSERT INTO transactions (
                id, sender_id, receiver_id, reference_id, 
                gross_amount, platform_fee_deducted, net_amount, 
                transaction_type, created_at
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'marketplace_purchase', NOW())`,
            [buyerId, design.owner_id, design.id, finalPrice, platformFee, designerPayout]
        );

        // 9. Register irrevocable ownership credentials
        await client.query(
            `INSERT INTO purchased_designs (id, user_id, design_id, purchase_price, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
            [buyerId, design.id, finalPrice]
        );

        await client.query('COMMIT');
        
        res.status(200).json({
            status: 'success',
            message: "Purchase completed successfully. Asset unlocked.",
            downloadUrl: design.high_res_file_url
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Purchase processing failed transaction context:", error);
        res.status(500).json({ message: "Transaction failed." });
    } finally {
        client.release();
    }
};

// @desc    Fetch Unlocked High-Res Downloads for Confirmed Purchases
exports.getDownloadedAsset = async (req, res) => {
    const { designId } = req.params;
    try {
        const check = await db.query(
            `SELECT d.high_res_file_url 
             FROM purchased_designs pd
             JOIN designs d ON pd.design_id = d.id
             WHERE pd.user_id = $1 AND pd.design_id = $2`,
            [req.user.id, designId]
        );

        if (check.rows.length === 0) {
            return res.status(403).json({ message: "Access Denied. Purchase file registration signature missing." });
        }

        res.status(200).json({ status: 'success', downloadUrl: check.rows[0].high_res_file_url });
    } catch (error) {
        console.error("Vault access extraction crash:", error);
        res.status(500).json({ message: "Secure digital file delivery error." });
    }
};