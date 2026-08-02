const db = require('../config/db');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------
// 1. SYSTEM USER MANAGEMENT
// ---------------------------------------------------------

// Create a new Admin (Only Superadmin power)
exports.createAdmin = async (req, res) => {
    const { full_name, email, password } = req.body;
    try {
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await db.query(
            `INSERT INTO users (full_name, email, password_hash, role, is_email_verified, approval_status) 
             VALUES ($1, $2, $3, 'admin', true, 'approved') RETURNING id, full_name, email, created_at`,
            [full_name, email, hashedPassword]
        );
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Admin creation failed. Email might exist." });
    }
};

// Global User Action (Ban, Suspend, Verify)
exports.manageUserStatus = async (req, res) => {
    const { userId } = req.params;
    const { status } = req.body; // 'approved', 'suspended', 'rejected'
    try {
        const result = await db.query(
            'UPDATE users SET approval_status = $1 WHERE id = $2 RETURNING id, full_name, approval_status',
            [status, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Status update failed" });
    }
};

// ---------------------------------------------------------
// 2. FINANCIAL & COMMISSION CONTROL
// ---------------------------------------------------------

// Change Global Commission Rate for all Designers
exports.updateGlobalCommission = async (req, res) => {
    const { newRate } = req.body; // e.g., 10.00 for 10%
    try {
        await db.query('UPDATE designer_profiles SET commission_rate = $1', [newRate]);
        res.status(200).json({ message: `Global commission rate updated to ${newRate}%` });
    } catch (error) {
        res.status(500).json({ message: "Failed to update commission rates" });
    }
};

// Get Full Financial Ledger
exports.getFinancialOverview = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                COUNT(*) as total_transactions,
                SUM(gross_amount) as total_volume,
                SUM(platform_fee_deducted) as total_platform_profit,
                AVG(platform_fee_deducted) as avg_fee_per_sale
            FROM transactions
        `);
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Financial audit failed" });
    }
};

// ---------------------------------------------------------
// 3. PLATFORM HEALTH (God View)
// ---------------------------------------------------------

exports.getGlobalStats = async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'designer') as designer_count,
                (SELECT COUNT(*) FROM users WHERE role = 'creator') as creator_count,
                (SELECT COUNT(*) FROM designs WHERE is_published = true) as live_designs,
                (SELECT COUNT(*) FROM bookings WHERE status = 'active') as ongoing_projects
        `);
        res.status(200).json({ status: 'success', data: stats.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Stats retrieval failed" });
    }
};

// Get all designers waiting for approval
exports.getPendingDesigners = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.id, u.full_name, u.email, dp.portfolio_url, dp.expertise_tags, u.created_at
            FROM users u
            JOIN designer_profiles dp ON u.id = dp.user_id
            WHERE u.role = 'designer' AND u.approval_status = 'pending'
            ORDER BY u.created_at ASC
        `);
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch pending designers." });
    }
};

exports.getPayoutDashboard = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.full_name, u.email, dw.available_balance, dw.total_earned, dw.updated_at
            FROM designer_wallets dw
            JOIN users u ON dw.user_id = u.id
            WHERE dw.available_balance > 0
            ORDER BY dw.available_balance DESC
        `);
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Payout dashboard failed." });
    }
};

// Take down a design if it violates terms
exports.moderateDesign = async (req, res) => {
    const { designId } = req.params;
    const { action } = req.body; // 'unpublish' or 'delete'
    try {
        if (action === 'unpublish') {
            await db.query('UPDATE designs SET is_published = false WHERE id = $1', [designId]);
        } else if (action === 'delete') {
            await db.query('DELETE FROM designs WHERE id = $1', [designId]);
        }
        res.status(200).json({ message: `Design ${action}ed successfully.` });
    } catch (error) {
        res.status(500).json({ message: "Moderation action failed." });
    }
};