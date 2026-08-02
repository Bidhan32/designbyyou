const db = require('../config/db');
const Stripe = require('stripe');

// Ensure you have your Stripe Secret Key in your environment variables
console.log("Checking Stripe Key:", process.env.STRIPE_SECRET_KEY ? "Found" : "Missing");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const GLOBAL_DEFAULT_COMMISSION = parseFloat(process.env.PLATFORM_COMMISSION_RATE) || 0.10;

/**
 * ============================================================================
 * 1. INITIALIZE CONTRACT & GENERATE STRIPE INTENT WITH ROLE & PAYWALL GATEKEEPER
 * ============================================================================
 */
exports.createP2PBooking = async (req, res) => {
    const client = await db.connect();
    const senderId = req.user.id; 
    const { 
        receiver_id,    
        design_id, 
        brief_text, 
        agreed_price, 
        deadline,
        booking_type 
    } = req.body;

    const parsedPrice = parseFloat(agreed_price);
    const parsedDeadline = new Date(deadline);
    
    // Validate inputs
    if (!receiver_id || isNaN(parsedPrice) || parsedPrice <= 0 || !deadline || isNaN(parsedDeadline.getTime())) {
        client.release();
        return res.status(400).json({ message: "Invalid contract participant, pricing, or missing/invalid date metrics." });
    }

    const utcDeadline = parsedDeadline.toISOString();

    // Prevent self-booking
    if (senderId === receiver_id) {
        client.release();
        return res.status(400).json({ message: "You cannot initiate an escrow contract with yourself." });
    }

    try {
        await client.query('BEGIN');

        // 🚨 1. ROLE, SUBSCRIPTION & DYNAMIC PRICING GATEKEEPER
        const userCheck = await client.query(
            `SELECT role, subscription_tier, subscription_active_until 
             FROM users 
             WHERE id = $1 FOR SHARE`,
            [senderId]
        );

        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Your user profile could not be verified on the network." });
        }

        const userData = userCheck.rows[0];

        // Strict Creator-Only Enforcement
        if (userData.role !== 'creator') {
            await client.query('ROLLBACK');
            return res.status(403).json({ 
                message: "Access Denied: Only Creator accounts are authorized to initiate commissions." 
            });
        }
        
        // Check if the user has an active premium subscription
        const isSubscribed = userData.subscription_tier && 
                             userData.subscription_tier !== 'free' && 
                             userData.subscription_active_until && 
                             new Date(userData.subscription_active_until) > new Date();

        // THE NEW BUSINESS LOGIC: Pay-As-You-Go vs Unlimited
        // Free users pay a 10% platform connection fee. Subscribed users pay 0%.
        const platformFee = isSubscribed ? 0 : (parsedPrice * 0.10);
        const totalCharge = parsedPrice + platformFee;
        const amountInCents = Math.round(totalCharge * 100);

        // 🚨 2. VERIFY TARGET EXISTS AND IS A DESIGNER
        const peerCheck = await client.query('SELECT id, role FROM users WHERE id = $1', [receiver_id]);
        
        if (peerCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Target profile not found on the network." });
        }

        if (peerCheck.rows[0].role !== 'designer') {
            await client.query('ROLLBACK');
            return res.status(403).json({ 
                message: "Invalid Target: Commissions can only be directed to verified Designers." 
            });
        }

        // 3. Schedule Conflict Guard 
        const conflictCheck = await client.query(
            `SELECT id FROM bookings 
             WHERE designer_id = $1 
             AND DATE(deadline) = DATE($2) 
             AND status IN ('pending', 'accepted', 'review_prototype', 'final_production', 'review_final', 'progress')`,
            [receiver_id, utcDeadline]
        );

        if (conflictCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ 
                message: "Schedule Conflict: This designer is already booked for this date. Please select an available slot." 
            });
        }

        const calculatedType = booking_type || (design_id ? 'marketplace' : 'commission');

        // 4. Generate Booking Record
        // We store the base agreed_price in the booking table. The fee is handled at the Stripe level.
        const newBooking = await client.query(
            `INSERT INTO bookings (
                id, creator_id, designer_id, design_id, brief_text, agreed_price, deadline, status, escrow_locked, booking_type, created_at, updated_at
             )
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', false, $7, NOW(), NOW())
             RETURNING *`,
            [senderId, receiver_id, design_id || null, brief_text, parsedPrice, utcDeadline, calculatedType]
        );

        // 4.5. ANTI-SPAM / METRICS: Increment bookings count
        await client.query(
            `UPDATE users SET bookings_made_count = COALESCE(bookings_made_count, 0) + 1 WHERE id = $1`,
            [senderId]
        );

        const bookingId = newBooking.rows[0].id;

        // 5. Initialize Stripe Escrow Vault with TOTAL CHARGE (Base + Fee)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'usd',
            metadata: {
                booking_id: bookingId, 
                sender_id: senderId,
                receiver_id: receiver_id,
                base_price: parsedPrice,
                platform_fee: platformFee,
                transaction_purpose: 'p2p_escrow_deposit'
            }
        });

        // 6. Save Payment Intent ID to the booking
        await client.query(
            `UPDATE bookings SET stripe_payment_intent_id = $1, updated_at = NOW() WHERE id = $2`,
            [paymentIntent.id, bookingId]
        );

        await client.query('COMMIT');
        
        res.status(201).json({
            status: 'success',
            booking: newBooking.rows[0],
            clientSecret: paymentIntent.client_secret,
            totalCharged: totalCharge
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Contract Generation Failure:", err);
        res.status(500).json({ message: "Failed to establish contract boundaries." });
    } finally {
        client.release();
    }
};
/**
 * ============================================================================
 * 2. WEBHOOK TARGET / ESCROW SECURE VAULT PROCESSING
 * ============================================================================
 */
exports.processEscrowLockInternal = async (paymentIntentObject, dbClient) => {
    const paymentIntentId = paymentIntentObject.id;
    const bookingId = paymentIntentObject.metadata.booking_id;

    if (!bookingId) return { success: false, reason: "Missing metadata parsing hooks." };

    const lockCheck = await dbClient.query(
        'SELECT escrow_locked, agreed_price, designer_id, creator_id FROM bookings WHERE id = $1 FOR UPDATE', 
        [bookingId]
    );
    
    if (lockCheck.rows.length === 0) {
        return { success: false, reason: "Target booking match missing." };
    }
    
    if (lockCheck.rows[0].escrow_locked) {
        return { success: true, message: "Idempotency catch: Escrow assets already secure." };
    }

    const { agreed_price, designer_id, creator_id } = lockCheck.rows[0];
    const grossAmount = parseFloat(agreed_price);

    // Lock the Escrow status
    await dbClient.query(
        `UPDATE bookings SET escrow_locked = true, status = 'accepted', updated_at = NOW() WHERE id = $1`,
        [bookingId]
    );

    // (Note: The bookings_made_count increment was moved to createP2PBooking to prevent spam)

    // Add funds to the designer's pending wallet
    await dbClient.query(
        `INSERT INTO designer_wallets (user_id, available_balance, pending_escrow_balance)
         VALUES ($1, 0.00, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET pending_escrow_balance = designer_wallets.pending_escrow_balance + $2`,
         [designer_id, grossAmount]
    );

    // Record the transaction
    await dbClient.query(
        `INSERT INTO transactions (id, sender_id, receiver_id, reference_id, gross_amount, platform_fee_deducted, net_amount, transaction_type, stripe_payment_intent_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, $4, 'escrow_lock', $5, NOW())
         ON CONFLICT (stripe_payment_intent_id) DO NOTHING`,
        [creator_id, designer_id, bookingId, grossAmount, paymentIntentId]
    );

    return { success: true };
};

/**
 * ============================================================================
 * 3. RELEASE PAYOUT (APPROVE DELIVERABLES)
 * ============================================================================
 */
exports.releaseP2PPayout = async (req, res) => {
    const client = await db.connect();
    const senderId = req.user.id; 
    const bookingId = req.params.id;

    try {
        await client.query('BEGIN');

        const bookingQuery = await client.query(
            `SELECT * FROM bookings WHERE id = $1 AND creator_id = $2 FOR UPDATE`,
            [bookingId, senderId]
        );

        if (bookingQuery.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Contract access denied or reference corrupt." });
        }

        const booking = bookingQuery.rows[0];
        
        if (booking.status === 'completed' && !booking.escrow_locked) {
            await client.query('ROLLBACK');
            return res.status(200).json({ status: 'success', message: "Payout was previously processed and cleared." });
        }

       if (!['review', 'review_final'].includes(booking.status) || !booking.escrow_locked) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Contract lifecycle phase is not under active review state." });
        }

        // Calculate fees
        const rateQuery = await client.query('SELECT commission_rate FROM designer_profiles WHERE user_id = $1', [booking.designer_id]);
        const commissionRate = rateQuery.rows.length > 0 && rateQuery.rows[0].commission_rate !== null 
            ? parseFloat(rateQuery.rows[0].commission_rate) 
            : GLOBAL_DEFAULT_COMMISSION;
        
        const grossInCents = Math.round(parseFloat(booking.agreed_price) * 100);
        const platformFeeInCents = Math.round(grossInCents * commissionRate);
        const providerNetInCents = grossInCents - platformFeeInCents;

        const grossAmount = parseFloat((grossInCents / 100).toFixed(2));
        const platformFeeDeducted = parseFloat((platformFeeInCents / 100).toFixed(2));
        const netAmount = parseFloat((providerNetInCents / 100).toFixed(2));

        // Mark as completed
        await client.query(
            `UPDATE bookings SET status = 'completed', escrow_locked = false, updated_at = NOW() WHERE id = $1`,
            [bookingId]
        );

        // 🚀 THE LEVEL-UP ALGORITHM
        // Safely increments their completed count and assigns the proper gamified tier
        await client.query(
            `UPDATE designer_profiles 
             SET 
                total_completed_bookings = COALESCE(total_completed_bookings, 0) + 1,
                tier = CASE
                    WHEN COALESCE(total_completed_bookings, 0) + 1 >= 50 THEN 'Diamond'
                    WHEN COALESCE(total_completed_bookings, 0) + 1 >= 20 THEN 'Gold'
                    WHEN COALESCE(total_completed_bookings, 0) + 1 >= 5 THEN 'Silver'
                    ELSE 'Bronze'
                END
             WHERE user_id = $1`,
            [booking.designer_id]
        );

        // Move funds from pending to available
        await client.query(
            `UPDATE designer_wallets 
             SET pending_escrow_balance = pending_escrow_balance - $1,
                 available_balance = available_balance + $2
             WHERE user_id = $3`,
            [grossAmount, netAmount, booking.designer_id]
        );

        // Record the final payout transaction
        await client.query(
            `INSERT INTO transactions (id, sender_id, receiver_id, reference_id, gross_amount, platform_fee_deducted, net_amount, transaction_type, stripe_payment_intent_id, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'marketplace_purchase', $7, NOW())`,
            [senderId, booking.designer_id, bookingId, grossAmount, platformFeeDeducted, netAmount, booking.stripe_payment_intent_id]
        );

        await client.query('COMMIT');
        res.status(200).json({ status: 'success', message: "Milestone cleared. Payout dispatched across peer bridge." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("P2P Payout Settlement Release Drop:", err);
        res.status(500).json({ message: "Critical failure clearing ledger parameters." });
    } finally {
        client.release();
    }
};
/**
 * ============================================================================
 * 4. GET UNIFIED WORKFLOWS
 * ============================================================================
 */
exports.getUnifiedPeerPipeline = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const pipeline = await db.query(
            `SELECT b.*, 
                    u_sender.full_name as sender_name, u_sender.profile_image_url as sender_avatar,
                    u_rec.full_name as receiver_name, u_rec.profile_image_url as receiver_avatar,
                    d.title AS reference_design_title
             FROM bookings b
             JOIN users u_sender ON b.creator_id = u_sender.id
             JOIN users u_rec ON b.designer_id = u_rec.id
             LEFT JOIN designs d ON b.design_id = d.id
             WHERE b.creator_id = $1 OR b.designer_id = $1
             ORDER BY b.created_at DESC`,
            [userId]
        );

        res.status(200).json({ status: 'success', data: pipeline.rows });
    } catch (err) {
        console.error("Unified Pipeline Parsing Crash:", err);
        res.status(500).json({ message: "Failed to evaluate structural peer workflows." });
    }
};

/**
 * ============================================================================
 * 5. MANUAL ESCROW VERIFICATION (For local testing)
 * ============================================================================
 */
exports.verifyEscrowPayment = async (req, res) => {
    const { bookingId } = req.body;
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const lockCheck = await client.query(
            'SELECT escrow_locked, agreed_price, designer_id, creator_id FROM bookings WHERE id = $1 FOR UPDATE', 
            [bookingId]
        );
        
        if (lockCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Target booking match missing." });
        }
        
        if (lockCheck.rows[0].escrow_locked) {
            await client.query('ROLLBACK');
            return res.status(200).json({ status: 'success', message: "Escrow already secure." });
        }

        const { agreed_price, designer_id } = lockCheck.rows[0];

        // Lock the booking
        await client.query(
            `UPDATE bookings SET escrow_locked = true, status = 'accepted', updated_at = NOW() WHERE id = $1`,
            [bookingId]
        );

        // (Note: The bookings_made_count increment was moved to createP2PBooking to prevent spam)

        // Add to Designer's Pending Wallet
        await client.query(
            `INSERT INTO designer_wallets (user_id, available_balance, pending_escrow_balance)
             VALUES ($1, 0.00, $2)
             ON CONFLICT (user_id) 
             DO UPDATE SET pending_escrow_balance = designer_wallets.pending_escrow_balance + $2`,
             [designer_id, agreed_price]
        );

        await client.query('COMMIT');
        return res.status(200).json({ status: 'success', message: "Escrow manually verified and locked." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Manual Escrow Verification Error:", err);
        return res.status(500).json({ message: "Failed to verify escrow status." });
    } finally {
        client.release();
    }
};

/**
 * ============================================================================
 * 6. LIFECYCLE MANAGEMENT ENDPOINTS
 * ============================================================================
 */

exports.submitPrototype = async (req, res) => {
    const client = await db.connect();
    const { id } = req.params;
    const { file_url, message } = req.body;
    
    try {
        await client.query(
            `UPDATE bookings 
             SET prototype_file_url = $1, prototype_message = $2, status = 'review_prototype', updated_at = NOW() 
             WHERE id = $3`,
            [file_url, message, id]
        );
        res.status(200).json({ status: 'success', message: 'Prototype submitted for client review.' });
    } catch (err) {
        console.error("Database Error in submitPrototype:", err); 
        res.status(500).json({ message: "Failed to submit prototype." });
    } finally {
        client.release();
    }
};

// Client approves the prototype (No money released yet)
exports.approvePrototype = async (req, res) => {
    const client = await db.connect();
    const { id } = req.params;
    
    try {
        await client.query(
            `UPDATE bookings 
             SET status = 'final_production', updated_at = NOW() 
             WHERE id = $1`,
            [id]
        );
        res.status(200).json({ status: 'success', message: 'Prototype approved. Provider notified to finish final assets.' });
    } catch (err) {
        res.status(500).json({ message: "Failed to approve prototype." });
    } finally {
        client.release();
    }
};

// Provider submits the final, polished deliverables and logs it in revision history
exports.submitFinalDeliverables = async (req, res) => {
    const client = await db.connect();
    const { id } = req.params; // The booking ID
    const { file_url, message } = req.body;
    const designerId = req.user.id; 
    
    try {
        await client.query('BEGIN');

        // 1. Verify ownership and lock the row to prevent race conditions
        const bookingCheck = await client.query(
            `SELECT creator_id FROM bookings WHERE id = $1 AND designer_id = $2 FOR UPDATE`,
            [id, designerId]
        );

        if (bookingCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Contract access denied or booking not found." });
        }

        const creatorId = bookingCheck.rows[0].creator_id;

        // 2. Update the main booking state to trigger the client's review UI
        await client.query(
            `UPDATE bookings 
             SET delivery_file_url = $1, delivery_message = $2, status = 'review_final', updated_at = NOW() 
             WHERE id = $3`,
            [file_url, message, id]
        );

        // 3. 🚀 THE UPGRADE: Log the submission securely in the revisions table
        const revisionInsert = await client.query(
            `INSERT INTO project_revisions (id, booking_id, creator_id, feedback_text, attachments, status, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, ARRAY[$4]::text[], 'completed', NOW(), NOW())
             RETURNING *`,
            [id, creatorId, message, file_url]
        );

        await client.query('COMMIT');
        
        res.status(200).json({ 
            status: 'success', 
            message: 'Final deliverables submitted for payout review.',
            data: revisionInsert.rows[0]
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Database Error in submitFinalDeliverables:", err);
        res.status(500).json({ message: "Failed to submit final work." });
    } finally {
        client.release();
    }
};

// Client rejects deliverables and requests changes
exports.requestRevision = async (req, res) => {
    const client = await db.connect();
    const { id } = req.params;
    const { notes, currentPhase } = req.body; 
    
    try {
        const newStatus = currentPhase === 'prototype' ? 'progress' : 'final_production';
        
        await client.query(
            `UPDATE bookings 
             SET status = $1, revision_notes = $2, updated_at = NOW() 
             WHERE id = $3`,
            [newStatus, notes, id]
        );
        res.status(200).json({ status: 'success', message: 'Revision requested. Designer has been notified.' });
    } catch (err) {
        console.error("Database Error in requestRevision:", err);
        res.status(500).json({ message: "Failed to submit revision request." });
    } finally {
        client.release();
    }
};

exports.requestCancellation = async (req, res) => {
    const client = await db.connect();
    const { id } = req.params;
    const { reason } = req.body;
    
    try {
        await client.query('BEGIN');

        const booking = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
        if (booking.rows.length === 0) throw new Error("Booking not found");
        const b = booking.rows[0];

        // Process refund AND fix the wallet if payment was previously locked
        if (b.escrow_locked) {
            
            // 1. Refund the client's credit card via Stripe
            if (b.stripe_payment_intent_id) {
                await stripe.refunds.create({
                    payment_intent: b.stripe_payment_intent_id,
                    reason: 'requested_by_customer'
                });
            }

            // 🚨 THE FIX: Remove the cancelled funds from the Designer's pending wallet!
            await client.query(
                `UPDATE designer_wallets 
                 SET pending_escrow_balance = pending_escrow_balance - $1 
                 WHERE user_id = $2`,
                [b.agreed_price, b.designer_id]
            );
        }

        // Mark the booking as cancelled and unlock escrow
        await client.query(
            `UPDATE bookings SET status = 'cancelled', cancellation_reason = $1, cancelled_at = NOW(), escrow_locked = false WHERE id = $2`,
            [reason, id]
        );

        await client.query('COMMIT');
        res.status(200).json({ status: 'success', message: 'Project cancelled, wallet adjusted, and refund initiated.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Cancellation Error:", err);
        res.status(500).json({ message: "Failed to process cancellation." });
    } finally {
        client.release();
    }
};

// Provider accepts the contract
exports.acceptProject = async (req, res) => {
    const client = await db.connect();
    const { id } = req.params;
    
    try {
        await client.query(
            `UPDATE bookings SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
            [id]
        );
        res.status(200).json({ status: 'success', message: 'Project accepted! The client will now fund the escrow.' });
    } catch (err) {
        console.error("Error accepting project:", err);
        res.status(500).json({ message: "Failed to accept the project." });
    } finally {
        client.release();
    }
};

// Provider rejects the contract before funding
exports.rejectProject = async (req, res) => {
    const client = await db.connect();
    const { id } = req.params;
    const { reason } = req.body; 
    const feedback = reason && reason.trim() !== '' ? reason : 'Declined by artist without specific feedback.';

    try {
        await client.query(
            `UPDATE bookings 
             SET status = 'cancelled', 
                 cancellation_reason = $1, 
                 cancelled_at = NOW() 
             WHERE id = $2`,
            [feedback, id]
        );
        res.status(200).json({ status: 'success', message: 'Project rejected and feedback sent to client.' });
    } catch (err) {
        console.error("Error rejecting project:", err);
        res.status(500).json({ message: "Failed to reject the project." });
    } finally {
        client.release();
    }
};

