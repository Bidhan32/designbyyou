const db = require('../config/db');
const Replicate = require('replicate');
/**
 * 1. GET MY DESIGNER PROFILE
 * Combines core registration info with custom designer metrics.
 */
exports.getMyProfile = async (req, res) => {
    const designerId = req.user.id;

    try {
        const query = `
            SELECT u.id as user_id, u.full_name, u.email, u.profile_image_url, u.role, u.approval_status,
                   dp.portfolio_url, dp.bio, dp.address_line, dp.city, dp.country, 
                   dp.tier, dp.xp_points, dp.avg_rating, dp.total_completed_bookings,
                   COALESCE(w.available_balance, 0.00) as available_balance, 
                   COALESCE(w.pending_escrow_balance, 0.00) as pending_escrow_balance
            FROM users u
            LEFT JOIN designer_profiles dp ON u.id = dp.user_id
            LEFT JOIN designer_wallets w ON u.id = w.user_id
            WHERE u.id = $1 AND u.role = 'designer'
        `;
        const result = await db.query(query, [designerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Designer identity record not found." });
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("Fetch Designer Profile Error:", err);
        res.status(500).json({ message: "Failed to assemble designer profile data." });
    }
};

/**
 * 2. UPDATE DESIGNER PROFILE
 * Safely updates editable account properties and profile parameters.
 * FIXED: Relocated read queries inside the transaction boundary to ensure data consistency.
 */
exports.updateProfile = async (req, res) => {
    const designerId = req.user.id;
    const { full_name, portfolio_url, bio, address_line, city, country } = req.body;
    
    // Captures avatar uploads if passed through the Cloudinary middleware file stream
    // Adjusted to ensure fallback parameters do not erase existing data fields
    const profile_image_url = req.file ? req.file.path : null;

    const client = await db.connect();
    let transactionStarted = false;

    try {
        await client.query('BEGIN');
        transactionStarted = true;

        // A. Dynamic Update for the Core User Profile properties
        if (full_name || profile_image_url) {
            await client.query(
                `UPDATE users 
                 SET full_name = COALESCE($1, full_name),
                     profile_image_url = COALESCE($2, profile_image_url),
                     updated_at = NOW()
                 WHERE id = $3`,
                [full_name, profile_image_url, designerId]
            );
        }

        // B. Update Custom Designer Profile Metrics
        await client.query(
            `UPDATE designer_profiles 
             SET portfolio_url = COALESCE($1, portfolio_url),
                 bio = COALESCE($2, bio),
                 address_line = COALESCE($3, address_line),
                 city = COALESCE($4, city),
                 country = COALESCE($5, country),
                 updated_at = NOW()
             WHERE user_id = $6`,
            [portfolio_url, bio, address_line, city, country, designerId]
        );

        // C. Re-fetch fresh properties INSIDE the transaction boundary to keep database threads fully consistent
        const refreshed = await client.query(`
            SELECT u.id as user_id, u.full_name, u.email, u.profile_image_url,
                   dp.portfolio_url, dp.bio, dp.address_line, dp.city, dp.country, dp.tier
            FROM users u
            LEFT JOIN designer_profiles dp ON u.id = dp.user_id
            WHERE u.id = $1
        `, [designerId]);

        await client.query('COMMIT');

        res.status(200).json({ 
            status: 'success', 
            message: "Marketplace portfolio parameters synchronized.", 
            data: refreshed.rows[0] 
        });

    } catch (err) {
        // Prevent application crash loops by making sure the transactional context exists before rolling back
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }
        console.error("Designer Profile Save Error:", err);
        res.status(500).json({ message: "Failed to save profile modifications." });
    } finally {
        client.release();
    }
};

/**
 * 3. GET DESIGNER DASHBOARD METRICS
 * Gathers job completions, open pitches, active design counts, and revenue summaries.
 */
exports.getDashboardMetrics = async (req, res) => {
    const designerId = req.user.id;

    try {
        const metricQueries = await Promise.all([
            // Active design concepts published on the feed
            db.query(`SELECT COUNT(*)::int as published_designs FROM designs WHERE owner_id = $1`, [designerId]),
            // Total active contract agreements being worked on right now
            db.query(`SELECT COUNT(*)::int as active_contracts FROM bookings WHERE designer_id = $1 AND status IN ('pending', 'progress', 'review')`, [designerId]),
            // Pitches submitted to creator posts that are currently under review
            db.query(`SELECT COUNT(*)::int as pending_pitches FROM designer_pitches WHERE designer_id = $1 AND status = 'pending'`, [designerId]),
            // Financial snapshot from their wallet
            db.query(`SELECT available_balance, pending_escrow_balance FROM designer_wallets WHERE user_id = $1`, [designerId])
        ]);

        const wallet = metricQueries[3].rows[0] || { available_balance: "0.00", pending_escrow_balance: "0.00" };

        res.status(200).json({
            status: 'success',
            data: {
                portfolio_designs_count: metricQueries[0].rows[0].published_designs,
                active_contracts_in_flight: metricQueries[1].rows[0].active_contracts,
                pitches_under_review: metricQueries[2].rows[0].pending_pitches,
                finances: {
                    available_payout_balance: parseFloat(wallet.available_balance),
                    locked_escrow_balance: parseFloat(wallet.pending_escrow_balance)
                }
            }
        });
    } catch (err) {
        console.error("Designer Analytics Failure:", err);
        res.status(500).json({ message: "Failed to compile designer studio performance charts." });
    }
};



// Initialize Replicate with your API Key
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * ============================================================================
 * AI PHOTOREALISTIC AVATAR GENERATOR (REPLICATE API)
 * ============================================================================
 */
exports.generateProAvatar = async (req, res) => {
    try {
        // 1. Ensure an image was uploaded
        if (!req.file) {
            return res.status(400).json({ message: "Base image required for generation." });
        }

        const { prompt } = req.body;

        // 2. Convert the uploaded image buffer into a Base64 string for Replicate
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        // 3. Run the AI Model (We are using an SDXL Image-to-Image model for realism)
        // You can change this model string to any portrait model on Replicate!
        const output = await replicate.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            {
                input: {
                    image: base64Image,
                    prompt: prompt || "Hyper-realistic corporate headshot, dramatic studio lighting, 8k resolution, cinematic",
                    prompt_strength: 0.65, // How much the AI changes the original photo (0.0 to 1.0)
                    num_inference_steps: 40,
                    refine: "expert_ensemble_refiner"
                }
            }
        );

        // 4. Return the generated image URL to the frontend
        // Replicate returns an array of output URLs, we grab the first one
        res.status(200).json({ 
            status: 'success', 
            generated_image_url: output[0] 
        });

    } catch (error) {
        console.error("AI Generation Forge Error:", error);
        res.status(500).json({ message: "Neural network processing failed. Please try again." });
    }
};