const db = require('../config/db'); 
const bcrypt = require('bcryptjs'); 

/**
 * @route   GET /api/v1/users
 * @desc    Fetches ALL users across the platform
 */
exports.getAllUsers = async (req, res) => {
    const queryText = `
        SELECT 
            u.id,
            u.role,
            u.full_name AS name,
            u.email,
            u.profile_image_url,
            u.approval_status,
            
            dp.bio AS designer_bio,
            dp.portfolio_url,
            dp.tier AS designer_tier,
            COALESCE(dp.commission_rate, 0) AS rate,
            COALESCE(dp.avg_rating, 0.0) AS avg_rating,
            
            cp.company_name,
            cp.preferred_category,
            cp.brand_guidelines_summary
            
        FROM users u
        LEFT JOIN designer_profiles dp ON u.id = dp.user_id
        LEFT JOIN creator_profiles cp ON u.id = cp.user_id
        WHERE u.role != 'superadmin'
        ORDER BY u.created_at DESC;
    `;

    try {
        const { rows } = await db.query(queryText);
        
        const normalizedUsers = rows.map(user => ({
            id: user.id,
            name: user.name || 'Unnamed Account',
            email: user.email,
            role: user.role, 
            profile_image_url: user.profile_image_url,
            rate: user.role === 'designer' ? user.rate : 0, 
            specification: user.role === 'designer' 
                ? (user.designer_bio || `${user.designer_tier || 'Standard'} Tier Designer`)
                : (user.company_name || 'Brand Creator Platform Member')
        }));

        return res.status(200).json(normalizedUsers);
    } catch (error) {
        console.error("❌ Database aggregation exception:", error);
        return res.status(500).json({ message: "Failed to gather comprehensive user network data records." });
    }
};

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get public profile data 
 */
exports.getUserProfileById = async (req, res) => {
    const { id } = req.params;

    try {
        const userCheck = await db.query('SELECT role FROM users WHERE id = $1', [id]);
        
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: "Visionary profile not found in the archives." });
        }

        const role = userCheck.rows[0].role;
        let result;

        if (role === 'designer') {
            result = await db.query(`
                SELECT u.id, u.full_name, u.email, u.role, u.profile_image_url, u.created_at,
                       dp.bio, dp.city as location, dp.portfolio_url as website, dp.total_completed_bookings
                FROM users u
                LEFT JOIN designer_profiles dp ON u.id = dp.user_id
                WHERE u.id = $1
            `, [id]);
        } else if (role === 'creator') {
            // Cleaned up the query to safely map the Creator's data to the profile UI
            result = await db.query(`
                SELECT u.id, u.full_name, u.email, u.role, u.profile_image_url, u.created_at,
                       cp.brand_guidelines_summary as bio, NULL as location, cp.company_name as website,
                       cp.company_name, cp.preferred_category, cp.brand_guidelines_summary
                FROM users u
                LEFT JOIN creator_profiles cp ON u.id = cp.user_id
                WHERE u.id = $1
            `, [id]);
        } else {
            result = await db.query(`SELECT id, full_name, email, role, profile_image_url, created_at FROM users WHERE id = $1`, [id]);
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });

    } catch (error) {
        console.error("Error fetching user profile:", error);
        if (error.code === '22P02') {
            return res.status(400).json({ message: "Invalid profile ID format." });
        }
        res.status(500).json({ message: "Server error while decrypting profile." });
    }
};

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update identity matrix
 */
exports.updateProfile = async (req, res) => {
    // 🚀 FIXED: Added remote_avatar_url to catch the Ready Player Me 3D Avatar!
    const { full_name, bio, location, company_name, preferred_category, brand_guidelines_summary, remote_avatar_url } = req.body; 
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // 🚀 FIXED: If RPM generated a remote URL, use it. Otherwise, fallback to the standard file upload.
    const profile_image_url = remote_avatar_url || (req.file ? req.file.path : null);

    try {
        await db.query('BEGIN');

        let userQuery = `
            UPDATE users 
            SET full_name = COALESCE($1, full_name),
                updated_at = NOW()
        `;
        const userValues = [full_name];
        let paramCount = 2;

        if (profile_image_url) {
            userQuery += `, profile_image_url = $${paramCount}`;
            userValues.push(profile_image_url);
            paramCount++;
        }

        userQuery += ` WHERE id = $${paramCount} RETURNING id, full_name, email, role, profile_image_url`;
        userValues.push(userId);

        const updatedUser = await db.query(userQuery, userValues);

        if (userRole === 'designer') {
            await db.query(`
                UPDATE designer_profiles 
                SET bio = COALESCE($1, bio), 
                    city = COALESCE($2, city) 
                WHERE user_id = $3
            `, [bio, location, userId]);
        } else if (userRole === 'creator') {
            await db.query(`
                UPDATE creator_profiles 
                SET company_name = COALESCE($1, company_name),
                    preferred_category = COALESCE($2, preferred_category),
                    brand_guidelines_summary = COALESCE($3, brand_guidelines_summary),
                    updated_at = NOW()
                WHERE user_id = $4
            `, [company_name, preferred_category, brand_guidelines_summary, userId]);
        }

        await db.query('COMMIT');

        res.status(200).json({ 
            status: 'success', 
            message: "Identity Matrix updated successfully.",
            data: updatedUser.rows[0]
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error("Profile Update Error:", error);
        res.status(500).json({ message: "Failed to update profile data." });
    }
};

/**
 * @route   PUT /api/v1/users/security
 * @desc    Update password
 */
exports.updateSecurity = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    try {
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        const user = userResult.rows[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "Current password is incorrect." });
        }

        const salt = await bcrypt.genSalt(12);
        const newHashedPassword = await bcrypt.hash(newPassword, salt);

        await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHashedPassword, userId]);

        res.status(200).json({ status: 'success', message: "Security protocols updated successfully." });

    } catch (error) {
        console.error("Security Update Error:", error);
        res.status(500).json({ message: "Failed to update security credentials." });
    }
};