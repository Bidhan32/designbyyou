const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper: Generate JWT Token
const signToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });
};

// ---------------------------------------------------------
// 1. REGISTER (Strict Schema Mapping)
// ---------------------------------------------------------
exports.register = async (req, res) => {
    const { 
        role, 
        full_name, 
        email, 
        password, 
        confirm_password, 
        portfolio_url, 
        bio,
        address_line, 
        city, 
        country,
        company_name,
        preferred_category
    } = req.body;
    
    const profileImageUrl = req.file ? req.file.path : null;

    try {
        if (password !== confirm_password) {
            return res.status(400).json({ message: "Passwords do not match." });
        }

        const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Email already exists." });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60000);

        await db.query('BEGIN');

        // Designers default to pending; creators skip to approved
        const approvalStatus = (role === 'designer') ? 'pending' : 'approved';

        const newUser = await db.query(
            `INSERT INTO users (id, full_name, email, password_hash, role, otp_code, otp_expires_at, approval_status, profile_image_url, created_at, updated_at) 
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id`,
            [full_name, email, hashedPassword, role, otp, otpExpires, approvalStatus, profileImageUrl]
        );

        const userId = newUser.rows[0].id;

        // ROLE STRUCTURE MATRIX
        if (role === 'designer') {
            // Note: user_id is the Primary Key here based on your schema
            await db.query(
                `INSERT INTO designer_profiles (user_id, portfolio_url, bio, address_line, city, country, tier, xp_points, commission_rate, avg_rating, total_completed_bookings) 
                 VALUES ($1, $2, $3, $4, $5, $6, 'junior', 0, 10.00, 0.0, 0)`,
                [userId, portfolio_url || '', bio || '', address_line || '', city || '', country || '']
            );
            
            // Note: user_id is the Primary Key here as well
            await db.query(
                `INSERT INTO designer_wallets (user_id, available_balance, pending_escrow_balance) 
                 VALUES ($1, 0.00, 0.00)`,
                [userId]
            );
        } else if (role === 'creator') {
            // Note: creator_profiles uses a separate 'id' as PK and 'user_id' as FK
            await db.query(
                `INSERT INTO creator_profiles (id, user_id, company_name, preferred_category, created_at, updated_at) 
                 VALUES (uuid_generate_v4(), $1, $2, $3, NOW(), NOW())`,
                [userId, company_name || '', preferred_category || '']
            );
        }

        await db.query('COMMIT');

        // Optional: Trigger your verification mailer here
        // await sendEmail({ email, subject: 'Verify Account', html: otpTemplate(full_name, otp) });

        res.status(201).json({ status: 'success', message: "Registration successful. OTP generated.", userId });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error("Registration Core Error:", error);
        res.status(500).json({ status: 'error', message: "Registration failed." });
    }
};

// ---------------------------------------------------------
// 2. EMAIL VERIFICATION
// ---------------------------------------------------------
exports.verifyEmail = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1 AND otp_code = $2 AND otp_expires_at > NOW()',
            [email, otp]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "Invalid or expired OTP." });
        }

        await db.query(
            'UPDATE users SET is_email_verified = true, otp_code = NULL, otp_expires_at = NULL WHERE email = $1',
            [email]
        );

        res.status(200).json({ status: 'success', message: "Email verified. You can now login." });
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({ message: "Verification error." });
    }
};

// ---------------------------------------------------------
// 3. SCHEMA-COMPLIANT LOGIN
// ---------------------------------------------------------
exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const initialCheck = await db.query('SELECT id, role, password_hash, approval_status FROM users WHERE email = $1', [email]);
        const preUser = initialCheck.rows[0];

        if (!preUser || !(await bcrypt.compare(password, preUser.password_hash))) {
            return res.status(401).json({ message: "Invalid email or password." });
        }

        if (preUser.role === 'designer' && preUser.approval_status !== 'approved') {
            return res.status(403).json({ message: "Your application is still under review." });
        }

        // Track last login time safely
        await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [preUser.id]);

        let userResult;
        if (preUser.role === 'designer') {
            userResult = await db.query(`
                SELECT u.id, u.full_name, u.email, u.role, u.profile_image_url, u.approval_status, u.is_email_verified,
                       dp.portfolio_url, dp.bio, dp.address_line, dp.city, dp.country, dp.tier, dp.xp_points, dp.avg_rating,
                       w.available_balance, w.pending_escrow_balance
                FROM users u
                LEFT JOIN designer_profiles dp ON u.id = dp.user_id
                LEFT JOIN designer_wallets w ON u.id = w.user_id
                WHERE u.id = $1
            `, [preUser.id]);
        } else if (preUser.role === 'creator') {
            userResult = await db.query(`
                SELECT u.id, u.full_name, u.email, u.role, u.profile_image_url, u.approval_status, u.is_email_verified,
                       cp.company_name, cp.preferred_category, cp.default_dimensions, cp.brand_guidelines_summary
                FROM users u
                LEFT JOIN creator_profiles cp ON u.id = cp.user_id
                WHERE u.id = $1
            `, [preUser.id]);
        } else {
            userResult = await db.query(`SELECT id, full_name, email, role, profile_image_url, approval_status FROM users WHERE id = $1`, [preUser.id]);
        }

        const user = userResult.rows[0];
        const token = signToken(user.id, user.role);

        res.status(200).json({ 
            status: 'success', 
            token, 
            user
        });
    } catch (error) {
        console.error("Login Engine Error:", error);
        res.status(500).json({ message: "An error occurred during login." });
    }
};

// ---------------------------------------------------------
// 4. SCHEMA-COMPLIANT SESSION VERIFICATION (/me)
// ---------------------------------------------------------
exports.getMe = async (req, res) => {
    try {
        let result;
        const targetId = req.user.id;
        const targetRole = req.user.role;

        if (targetRole === 'designer') {
            result = await db.query(`
                SELECT u.id, u.full_name, u.email, u.role, u.profile_image_url,
                       dp.portfolio_url, dp.bio, dp.tier, dp.avg_rating,
                       w.available_balance 
                FROM users u
                LEFT JOIN designer_profiles dp ON u.id = dp.user_id
                LEFT JOIN designer_wallets w ON u.id = w.user_id
                WHERE u.id = $1
            `, [targetId]);
        } else if (targetRole === 'creator') {
            result = await db.query(`
                SELECT u.id, u.full_name, u.email, u.role, u.profile_image_url,
                       cp.company_name, cp.preferred_category, cp.default_dimensions
                FROM users u
                LEFT JOIN creator_profiles cp ON u.id = cp.user_id
                WHERE u.id = $1
            `, [targetId]);
        } else {
            result = await db.query(`SELECT id, full_name, email, role, profile_image_url FROM users WHERE id = $1`, [targetId]);
        }

        if (!result.rows[0]) {
            return res.status(404).json({ message: "User session could not be restored." });
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("Session Sync Failure:", err);
        res.status(500).json({ message: "Internal server error reading session data." });
    }
};

// ---------------------------------------------------------
// 5. FORGOT PASSWORD (OTP Version)
// ---------------------------------------------------------
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const result = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(404).json({ message: "User not found." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60000); // 10 Minutes expiry

        await db.query(
            'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE email = $3',
            [otp, expires, email]
        );

        // Optional: Trigger password recovery email transmission here
        /*
        await sendEmail({
            email: email,
            subject: 'DesignByYou - Password Reset Code',
            html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Code: ${otp}</h2></div>`
        });
        */

        res.status(200).json({ message: "6-digit code generated and saved to email record." });
    } catch (error) {
        console.error("FORGOT PASSWORD ERROR:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// ---------------------------------------------------------
// 6. RESET PASSWORD (OTP Version)
// ---------------------------------------------------------
exports.resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;

    try {
        const userResult = await db.query(
            'SELECT id FROM users WHERE email = $1 AND otp_code = $2 AND otp_expires_at > NOW()',
            [email, otp]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: "Invalid or expired code." });
        }

        const salt = await bcrypt.genSalt(12);
        const newHashedPassword = await bcrypt.hash(newPassword, salt);

        await db.query(
            'UPDATE users SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL WHERE id = $2',
            [newHashedPassword, userResult.rows[0].id]
        );

        res.status(200).json({ message: "Password reset successful." });
    } catch (error) {
        console.error("RESET ERROR:", error);
        res.status(500).json({ message: "Reset password failed." });
    }
};

// ---------------------------------------------------------
// 7. TEMPORARY SUPERADMIN SETUP
// ---------------------------------------------------------
exports.setupSuperadmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.query('DELETE FROM users WHERE email = $1', [email]);

        // FIX: Inserted explicit uuid_generate_v4() matching schema constraints
        await db.query(
            `INSERT INTO users (id, full_name, email, password_hash, role, is_email_verified, approval_status, created_at, updated_at) 
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
            ['Main Admin', email, hashedPassword, 'superadmin', true, 'approved']
        );

        res.status(201).json({ message: "Superadmin fixed! You can now login." });
    } catch (err) {
        console.error("Superadmin Setup Failure:", err);
        res.status(500).json({ error: err.message });
    }
};

// 8. RESEND OTP TOKEN
// ---------------------------------------------------------
exports.resendOtp = async (req, res) => {
    const { email } = req.body;
    try {
        const userCheck = await db.query('SELECT id, is_email_verified FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: "No account registered with this email address." });
        }

        if (userCheck.rows[0].is_email_verified) {
            return res.status(400).json({ message: "This email is already verified. Please log in." });
        }

        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const newOtpExpires = new Date(Date.now() + 10 * 60000); // 10 minutes

        await db.query(
            'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE email = $3',
            [newOtp, newOtpExpires, email]
        );

        // Optional: Trigger your mailer wrapper again here
        // await sendEmail({ email, subject: 'New OTP Code', html: otpTemplate(email, newOtp) });

        res.status(200).json({ status: 'success', message: "A fresh verification code has been generated." });
    } catch (error) {
        console.error("Resend OTP Engine Error:", error);
        res.status(500).json({ message: "Failed to generate or dispatch a new code." });
    }
};