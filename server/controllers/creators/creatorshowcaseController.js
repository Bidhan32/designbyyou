const db = require('../../config/db');

// @desc    Get All Published Showcase Assets (With Native Search & Filter)
exports.getShowcase = async (req, res) => {
    try {
        const { style, minPrice, maxPrice, search } = req.query;
        
        let query = `
            SELECT 
                d.id AS design_id, d.title, d.slug, d.watermarked_preview_url, 
                d.style_category, d.tags, d.base_price AS starting_price,
                u.id AS designer_id, u.full_name AS designer_name, u.profile_image_url AS designer_avatar
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
            query += ` AND d.base_price >= $${params.length}`;
        }
        if (maxPrice) {
            params.push(parseFloat(maxPrice));
            query += ` AND d.base_price <= $${params.length}`;
        }
        if (search) {
            params.push(`%${search}%`);
            const searchIndex = params.length;
            
            params.push(search.toLowerCase());
            const exactIndex = params.length;

            query += ` AND (d.title ILIKE $${searchIndex} OR d.description ILIKE $${searchIndex} OR $${exactIndex} = ANY(d.tags))`;
        }

        query += ` ORDER BY d.created_at DESC`;

        const result = await db.query(query, params);
        res.status(200).json({ status: 'success', results: result.rows.length, data: result.rows });
    } catch (error) {
        console.error("Showcase Database query error:", error);
        res.status(500).json({ message: "The Creator Showcase is currently unavailable." });
    }
};

// @desc    Get Single Showcase Asset Details
// @desc    Get Single Showcase Asset Details
exports.getShowcaseItem = async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await db.query(`
            SELECT 
                d.id AS design_id, d.title, d.slug, d.description, 
                d.watermarked_preview_url, d.base_price AS starting_price, 
                d.tags, d.style_category, d.created_at,
                d.canvas_state,  /* 🚀 ADDED: Now the backend sends the vector math! */
                u.id AS designer_id, u.full_name AS designer_name, u.profile_image_url AS designer_avatar,
                p.bio, p.avg_rating, p.total_completed_bookings
            FROM designs d
            JOIN users u ON d.owner_id = u.id
            LEFT JOIN designer_profiles p ON u.id = p.user_id
            WHERE d.slug = $1 AND d.is_published = true AND d.is_public = true
        `, [slug]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Portfolio item not found." });
        }
        
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error("Error retrieving showcase item:", error);
        res.status(500).json({ message: "Error loading portfolio details." });
    }
};